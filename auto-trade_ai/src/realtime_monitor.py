"""
リアルタイム株価予測モニター

kabu ステーション WebSocket から価格データを受信し、
8 指標と ENTRY_SCORE を計算してコンソールに表示 + CSV 保存。
発注は行わない。

取引時間:  前場 09:00-11:30 / 後場 12:30-15:30
15:30 に自動停止。
"""

import asyncio
import csv
import logging
import sys
from datetime import datetime, time
from pathlib import Path

from src.config import (
    BASELINE_DAILY_VOLUME,
    MONITOR_EXCHANGE,
    MONITOR_MAX_SYMBOLS,
    MONITOR_REFRESH_SEC,
    MONITOR_RESCAN_MIN,
    WS_URL,
)
from src.entry_scorer import calculate_entry_score
from src.indicator import SymbolState, update_state
from src.kabu_client import KabuClient
from src.ws_client import WebSocketClient

log = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

_SESSIONS = [(time(9, 0), time(11, 30)), (time(12, 30), time(15, 30))]
_MARKET_CLOSE = time(15, 30)

_MONITOR_RANKING_TYPES = [1, 6, 7]

# デイトレ対象外の銘柄を除外するキーワード
_EXCLUDE_NAME_KEYWORDS = [
    "ＥＴＦ", "ETF", "ＥＴＮ", "ETN",
    "上場投信", "上場投資信託",
    "国債", "社債",
    "ファンド",
]

_SIGNAL_MARK = {
    "ENTRY":        "★★★",
    "WATCH_STRONG": "★★ ",
    "WATCH":        "★  ",
    "NO_ENTRY":     "   ",
}


def _in_market_hours() -> bool:
    t = datetime.now().time()
    return any(s <= t <= e for s, e in _SESSIONS)


def _is_tradable(item: dict) -> bool:
    """ETF・国債・投資信託など、デイトレ対象外の銘柄を除外する。

    銘柄コードに英字が含まれるかどうかでは判定しない。JPXは2024年頃から
    ETF/ETN以外の通常の新規上場企業にも英字入りコードを割り当てており、
    コード形式による除外は対象を広げすぎてしまうため、銘柄名キーワードのみで判定する。
    """
    name = item.get("SymbolName", "") or ""
    return not any(kw in name for kw in _EXCLUDE_NAME_KEYWORDS)


def _seconds_until_next_session() -> float:
    now = datetime.now()
    t = now.time()
    for start, end in _SESSIONS:
        if t < start:
            target = datetime.combine(now.date(), start)
            return max((target - now).total_seconds(), 0.0)
        if t <= end:
            return 0.0
    return 0.0


class RealtimeMonitor:
    def __init__(self, client: KabuClient) -> None:
        self._client = client
        self._token: str = client._token or ""
        self._states: dict[str, SymbolState] = {}
        self._ws_client: WebSocketClient | None = None
        self._last_rescan: datetime = datetime.min
        self._csv_path = OUTPUT_DIR / f"monitor_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        self._csv_header_written = False

    # ── エントリーポイント ────────────────────────────────────────────────────

    async def run(self) -> None:
        """メインループ。Ctrl+C または 15:30 で停止。"""
        log.info("リアルタイムモニター起動 WS=%s", WS_URL)
        log.info("CSV 出力先: %s", self._csv_path)

        loop = asyncio.get_event_loop()

        # 初回スキャン（市場時間外でも実施して銘柄を登録しておく）
        await loop.run_in_executor(None, self._rescan)

        self._ws_client = WebSocketClient(
            url=WS_URL,
            token=self._token,
            on_message=self._on_ws_message,
        )

        tasks = [
            asyncio.create_task(self._ws_client.run(),    name="ws"),
            asyncio.create_task(self._display_loop(),     name="display"),
            asyncio.create_task(self._rescan_loop(),      name="rescan"),
            asyncio.create_task(self._watchdog(),         name="watchdog"),
        ]

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass
        finally:
            if self._ws_client:
                self._ws_client.stop()
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            log.info("モニター終了")

    # ── ランキング取得・銘柄登録 ──────────────────────────────────────────────

    def _rescan(self) -> None:
        """ランキング取得 → /register → SymbolState 更新（同期、executor 内で実行）。"""
        log.info("ランキング再取得中... (Types=%s, Exchange=%s)",
                 _MONITOR_RANKING_TYPES, MONITOR_EXCHANGE)

        symbol_data: dict[str, dict] = {}

        excluded = 0
        for rt in _MONITOR_RANKING_TYPES:
            try:
                data = self._client.get(
                    "/ranking",
                    params={"Type": rt, "ExchangeDivision": MONITOR_EXCHANGE},
                )
                for item in (data.get("Ranking") or []):
                    sym = item.get("Symbol")
                    if not sym:
                        continue
                    if not _is_tradable(item):
                        excluded += 1
                        continue
                    if sym not in symbol_data:
                        symbol_data[sym] = {"count": 0, "item": item}
                    symbol_data[sym]["count"] += 1
            except Exception as e:
                log.warning("ランキング Type=%d 取得失敗: %s", rt, e)

        if excluded:
            log.info("ETF・国債など対象外銘柄を除外: %d件", excluded)

        if not symbol_data:
            log.warning("全ランキングが空です。次回スキャンを待ちます。")
            self._last_rescan = datetime.now()
            return

        # 複数ランキング出現数が多い順にソートして上位 N 件を選択
        sorted_syms = sorted(
            symbol_data.items(),
            key=lambda x: -x[1]["count"],
        )[:MONITOR_MAX_SYMBOLS]

        # PUT /register
        symbols_for_register = [
            {"Symbol": sym, "Exchange": info["item"].get("Exchange", 1)}
            for sym, info in sorted_syms
        ]
        try:
            self._client.put("/register", body={"Symbols": symbols_for_register})
            log.info("%d 銘柄を登録 (複数ランキング出現: %d 件)",
                     len(symbols_for_register),
                     sum(1 for _, d in sorted_syms if d["count"] >= 2))
        except Exception as e:
            log.error("PUT /register 失敗: %s", e)

        # SymbolState 更新（登録外の銘柄を削除、新規銘柄を追加）
        registered = {sym for sym, _ in sorted_syms}

        for sym in list(self._states.keys()):
            if sym not in registered:
                del self._states[sym]

        for sym, info in sorted_syms:
            if sym not in self._states:
                item = info["item"]
                state = SymbolState(symbol=sym, symbol_name=item.get("SymbolName", ""))
                # ランキングデータで初期値をセット
                state.current_price = float(item.get("CurrentPrice") or 0)
                state.prev_close = float(
                    item.get("PreviousClosePrice")
                    or item.get("PreviousClose")
                    or 0
                )
                self._states[sym] = state

        self._last_rescan = datetime.now()
        log.info("スキャン完了: %d 銘柄を監視", len(self._states))

    # ── 非同期ループ ──────────────────────────────────────────────────────────

    async def _rescan_loop(self) -> None:
        """MONITOR_RESCAN_MIN 分ごとにランキングを再取得する。"""
        loop = asyncio.get_event_loop()
        while True:
            await asyncio.sleep(MONITOR_RESCAN_MIN * 60)
            await loop.run_in_executor(None, self._rescan)

    async def _display_loop(self) -> None:
        """MONITOR_REFRESH_SEC 秒ごとにコンソール表示と CSV 保存を行う。"""
        while True:
            self._print_table()
            self._save_csv_snapshot()
            await asyncio.sleep(MONITOR_REFRESH_SEC)

    async def _watchdog(self) -> None:
        """15:30 になったら全タスクをキャンセルして終了する。"""
        while True:
            if datetime.now().time() >= _MARKET_CLOSE:
                log.info("15:30 到達。モニターを停止します。")
                if self._ws_client:
                    self._ws_client.stop()
                current = asyncio.current_task()
                for t in asyncio.all_tasks():
                    if t is not current:
                        t.cancel()
                return
            # 昼休み中ならログを出してスリープ
            if not _in_market_hours():
                wait = _seconds_until_next_session()
                if wait > 0:
                    log.info("昼休み中。%.0f 秒後（12:30）に再開します。", wait)
            await asyncio.sleep(30)

    # ── WebSocket コールバック ────────────────────────────────────────────────

    async def _on_ws_message(self, msg: dict) -> None:
        sym = msg.get("Symbol")
        if not sym or sym not in self._states:
            return
        state = self._states[sym]
        update_state(state, msg, BASELINE_DAILY_VOLUME)
        state.entry_score, state.signal = calculate_entry_score(state)

    # ── コンソール表示 ────────────────────────────────────────────────────────

    def _print_table(self) -> None:
        sorted_states = sorted(self._states.values(), key=lambda s: -s.entry_score)
        now_str = datetime.now().strftime("%H:%M:%S")
        market_status = "取引中" if _in_market_hours() else "時間外"
        rescan_ago = int((datetime.now() - self._last_rescan).total_seconds() / 60)

        width = 122
        # 画面クリア（ANSI）
        print("\033[2J\033[H", end="")
        print(f"{'=' * width}")
        print(
            f"  kabu リアルタイムモニター  [{now_str}]  "
            f"状態:{market_status}  監視:{len(sorted_states)}銘柄  "
            f"最終スキャン:{rescan_ago}分前"
        )
        print(f"{'=' * width}")
        print(
            f"{'#':>3}  {'Symbol':<6}  {'銘柄名':<16}  "
            f"{'現在値':>8}  {'予想騰落%':>9}  {'出来高倍':>8}  "
            f"{'買優勢%':>7}  {'VWAP乖離%':>9}  {'SCORE':>6}  シグナル"
        )
        print("-" * width)

        for i, s in enumerate(sorted_states[:30], 1):
            mark = _SIGNAL_MARK.get(s.signal, "   ")
            print(
                f"{i:>3}  {s.symbol:<6}  {s.symbol_name[:16]:<16}  "
                f"{s.current_price:>8.1f}  "
                f"{s.expected_change_pct:>+9.2f}  "
                f"{s.volume_surge_rate:>8.2f}x  "
                f"{s.buy_dominance:>7.1f}  "
                f"{s.vwap_deviation:>+9.2f}  "
                f"{s.entry_score:>6.1f}  {mark} {s.signal}"
            )
        print(f"{'=' * width}")
        print("  Ctrl+C で停止  |  ENTRY≥85  WATCH_STRONG≥70  WATCH≥55")

    # ── CSV 保存 ──────────────────────────────────────────────────────────────

    def _save_csv_snapshot(self) -> None:
        if not self._states:
            return
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fieldnames = [
            "timestamp", "symbol", "symbol_name", "current_price", "prev_close",
            "expected_price", "expected_change_pct", "buy_dominance", "imbalance",
            "volume_surge_rate", "expected_turnover", "fluctuation_count",
            "vwap_deviation", "entry_score", "signal", "update_count", "last_updated",
        ]
        rows = [
            {
                "timestamp":           ts,
                "symbol":              s.symbol,
                "symbol_name":         s.symbol_name,
                "current_price":       s.current_price,
                "prev_close":          s.prev_close,
                "expected_price":      round(s.expected_price, 2),
                "expected_change_pct": round(s.expected_change_pct, 2),
                "buy_dominance":       round(s.buy_dominance, 2),
                "imbalance":           round(s.imbalance, 3),
                "volume_surge_rate":   round(s.volume_surge_rate, 3),
                "expected_turnover":   round(s.expected_turnover, 2),
                "fluctuation_count":   s.fluctuation_count,
                "vwap_deviation":      round(s.vwap_deviation, 2),
                "entry_score":         s.entry_score,
                "signal":              s.signal,
                "update_count":        s.update_count,
                "last_updated":        s.last_updated,
            }
            for s in self._states.values()
        ]
        try:
            with open(self._csv_path, "a", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                if not self._csv_header_written:
                    writer.writeheader()
                    self._csv_header_written = True
                writer.writerows(rows)
        except Exception as e:
            log.warning("CSV 書き込み失敗: %s", e)


def run(client: KabuClient) -> None:
    """同期エントリーポイント（main.py から呼ばれる）。"""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    monitor = RealtimeMonitor(client)
    try:
        asyncio.run(monitor.run())
    except KeyboardInterrupt:
        log.info("Ctrl+C でモニターを停止しました。")
