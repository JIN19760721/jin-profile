"""
メイン取引ループ。

タイムライン:
  08:00  yfinance 事前スキャン → daily_candidates に保存（kabu APIが使えない時間帯向け）
  08:30  Claude 寄り付き前フィルタ（気配値ベース、失敗時は何もせずフェイルオープン）
  08:57  kabu station ランキングによる寄り付き前スキャン → daily_candidates を更新
  09:00〜  POSITION_CHECK_INTERVAL_SEC(既定10秒)間隔: ポジション監視（損切り・利確・PENDING確認）
           POLLING_INTERVAL(既定60秒)間隔          : 新規エントリー探索（ランキング取得・surge評価）
  15:20  強制全クローズ → 終了
"""

import logging
import time
from datetime import datetime, timedelta
from pathlib import Path

from src import db, notifier, price_cache
from src.config import (
    DB_PATH,
    ENTRY_EMBARGO_MIN,
    FORCE_CLOSE_TIME,
    ORDER_PRICE_BUFFER_PCT,
    ORDER_QTY,
    PATHD_ENABLED,
    PATHD_MIN_VOLUME_SPIKE,
    PATHD_CONFIRM_MIN,
    POLLING_INTERVAL,
    POSITION_CHECK_INTERVAL_SEC,
    PRE_MARKET_LLM_ENABLED,
    PRE_MARKET_LLM_TIME,
    PRE_MARKET_SCAN_TIME,
    PRE_MARKET_YFINANCE_TIME,
    SURGE_HIST_DAYS,
    SURGE_NOTIFY_DELTA,
    SURGE_NOTIFY_ENABLED,
    SURGE_NOTIFY_ON_TRANSITION_ONLY,
    TRADE_EXCHANGE,
    TRADING_SESSIONS,
)
from src import premarket_llm_filter
from src.entry_policy import check as policy_check
from src.kabu_client import KabuClient
from src.order_manager import OrderManager
from src.position_tracker import PositionTracker
from src.premarket_screener import run_premarket_scan
from src.ranking_fetcher import fetch_all_rankings
from src.risk_manager import RiskManager
from src.screener import merge_and_score
from src.scoring.surge_score import calculate_surge_score

log = logging.getLogger(__name__)

_PRE_MARKET_SCAN_RETRIES = 5
_PRE_MARKET_SCAN_RETRY_INTERVAL = 60  # seconds


def _parse_hhmm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def _now_hhmm() -> tuple[int, int]:
    n = datetime.now()
    return n.hour, n.minute


def _hhmm_to_minutes(h: int, m: int) -> int:
    return h * 60 + m


def _is_past_or_equal(hhmm_str: str) -> bool:
    now_min = _hhmm_to_minutes(*_now_hhmm())
    t_min = _hhmm_to_minutes(*_parse_hhmm(hhmm_str))
    return now_min >= t_min


def is_in_trading_session(sessions: list[dict]) -> bool:
    now_min = _hhmm_to_minutes(*_now_hhmm())
    for s in sessions:
        start = _hhmm_to_minutes(*_parse_hhmm(s["start"]))
        end   = _hhmm_to_minutes(*_parse_hhmm(s["end"]))
        if start <= now_min <= end:
            return True
    return False


def _in_entry_embargo(sessions: list[dict], embargo_min: int) -> bool:
    """各セッション開始（寄り付き・後場再開）直後の様子見期間中かどうかを判定する。

    セッション開始直後は板が薄く値動きが荒れやすく、飛び乗ってすぐ反転
    ＝損切りというパターンが起きやすいため、新規エントリーのみを一時停止する
    （保有ポジションの監視・損切り・利確は対象外）。
    """
    if embargo_min <= 0:
        return False
    now_min = _hhmm_to_minutes(*_now_hhmm())
    for s in sessions:
        start = _hhmm_to_minutes(*_parse_hhmm(s["start"]))
        if start <= now_min < start + embargo_min:
            return True
    return False


def _run_pre_market_scan(client: KabuClient) -> list[dict]:
    """スキャンを実行して daily_candidates に保存する。最大 N 回リトライ。"""
    for attempt in range(1, _PRE_MARKET_SCAN_RETRIES + 1):
        log.info("寄り付き前スキャン 試行 %d/%d", attempt, _PRE_MARKET_SCAN_RETRIES)
        try:
            rankings = fetch_all_rankings(client, TRADE_EXCHANGE)
            if all(len(v) == 0 for v in rankings.values()):
                log.warning("ランキングAPI が空です（前場準備中の可能性）")
            else:
                candidates = merge_and_score(rankings)
                if candidates:
                    db.save_daily_candidates(candidates)
                    log.info("寄り付き前スキャン完了: %d 件を保存", len(candidates))
                    return candidates
        except KeyboardInterrupt:
            raise
        except Exception as e:
            log.error("寄り付き前スキャン エラー: %s", e)

        if attempt < _PRE_MARKET_SCAN_RETRIES:
            log.info("%d 秒後に再試行します...", _PRE_MARKET_SCAN_RETRY_INTERVAL)
            try:
                time.sleep(_PRE_MARKET_SCAN_RETRY_INTERVAL)
            except KeyboardInterrupt:
                raise

    log.warning("寄り付き前スキャンがすべてのリトライで失敗しました。取引時間外の可能性があります。ポーリングループに移行します。")
    return []


def _wait_until(hhmm_str: str) -> None:
    h, m = _parse_hhmm(hhmm_str)
    target = datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
    if datetime.now() >= target:
        return
    wait_sec = (target - datetime.now()).total_seconds()
    log.info("%s まで %.0f 秒待機します...", hhmm_str, wait_sec)
    time.sleep(max(wait_sec, 0))


class TradeEngine:
    def __init__(self, client: KabuClient, dry_run: bool = False) -> None:
        self._client = client
        self.dry_run = dry_run
        self._om = OrderManager(client, dry_run=dry_run)
        self._pt = PositionTracker(client, dry_run=dry_run)
        self._rm = RiskManager(dry_run=dry_run)
        self._shutdown_done = False
        # surge_score 用: symbol → (avg_volume_20d, avg_turnover_20d)
        self._hist_cache: dict[str, tuple[float, float]] = {}
        # surge 連続確認: symbol → 閾値超え連続回数（経路A/B/C: SURGE_CANDIDATE/STRONG）
        self._surge_confirm: dict[str, int] = {}
        # 出来高先行確認: symbol → PRE_SURGE_SETUP 連続回数（経路D）
        self._pre_surge_confirm: dict[str, int] = {}
        # surge 通知済みシグナル: symbol → 最後に通知したシグナル（遷移検知用）
        self._surge_notified_signal: dict[str, str] = {}
        # エントリー直前通知済みセット（同一銘柄の重複通知防止）
        self._pre_entry_notified: set[str] = set()
        db.init_db(DB_PATH)

    def run(self) -> None:
        log.info(
            "=== 自動売買エンジン 起動 [%s] ===",
            "DRY-RUN" if self.dry_run else "本番",
        )

        # ── yfinance 事前スキャン（kabu API が使えない 8:00〜8:44 向け）──
        try:
            self._run_yfinance_premarket_scan()
        except KeyboardInterrupt:
            log.info("事前スキャン中に手動中断を検出しました。")
            self._on_shutdown()
            return

        # ── Claude 寄り付き前フィルタ（気配値ベース）──────────────────────
        try:
            self._run_llm_premarket_filter()
        except KeyboardInterrupt:
            log.info("Claudeフィルタ中に手動中断を検出しました。")
            self._on_shutdown()
            return

        # ── 寄り付き前スキャン ──────────────────────────────────────────
        try:
            self._ensure_pre_market_scan()
        except KeyboardInterrupt:
            log.info("スキャン中に手動中断を検出しました。")
            self._on_shutdown()
            return

        # ── メインポーリングループ ────────────────────────────────────────
        # ポジション監視は POSITION_CHECK_INTERVAL_SEC 間隔、新規エントリー探索は
        # POLLING_INTERVAL 間隔（ticks_per_scan 回に1回）で回す。
        ticks_per_scan = max(1, round(POLLING_INTERVAL / POSITION_CHECK_INTERVAL_SEC))
        tick_count = 0
        try:
            while True:
                self._tick_positions()
                tick_count += 1
                if tick_count % ticks_per_scan == 0:
                    self._tick_entries()
                time.sleep(POSITION_CHECK_INTERVAL_SEC)
        except KeyboardInterrupt:
            log.info("手動中断を検出しました。")
        finally:
            self._on_shutdown()

    def _run_yfinance_premarket_scan(self) -> None:
        """yfinance ベースの事前スキャンを実行する。

        実行条件:
          - 起動時刻が PRE_MARKET_YFINANCE_TIME（デフォルト 08:00）以前 → その時刻まで待機して実行
          - PRE_MARKET_YFINANCE_TIME〜PRE_MARKET_SCAN_TIME の間 → 即時実行
          - PRE_MARKET_SCAN_TIME 以降（kabu API が使える時間帯） → スキップ
          - 当日の daily_candidates が既に存在する → スキップ
        """
        now_min      = _hhmm_to_minutes(*_now_hhmm())
        yf_min       = _hhmm_to_minutes(*_parse_hhmm(PRE_MARKET_YFINANCE_TIME))
        kabu_min     = _hhmm_to_minutes(*_parse_hhmm(PRE_MARKET_SCAN_TIME))

        # kabu スキャン時刻以降はスキップ（kabu API で上書きされるため不要）
        if now_min >= kabu_min:
            log.info("kabu スキャン時刻以降のため yfinance 事前スキャンをスキップします")
            return

        # 当日データが既にあればスキップ
        existing = db.get_daily_candidates()
        if existing:
            log.info("当日の候補銘柄が既に %d 件あるため yfinance 事前スキャンをスキップします", len(existing))
            return

        # 事前スキャン時刻前なら待機
        if now_min < yf_min:
            _wait_until(PRE_MARKET_YFINANCE_TIME)

        log.info("=== yfinance 事前スキャン開始 ===")
        try:
            candidates = run_premarket_scan()
            if candidates:
                db.save_daily_candidates(candidates)
                log.info("yfinance 事前スキャン完了: %d 件を保存 (score>=60: %d件)",
                         len(candidates),
                         sum(1 for c in candidates if c["score"] >= 60))
                notifier.notify_scan_complete(candidates, dry_run=self.dry_run)
            else:
                log.warning("yfinance 事前スキャン: 候補なし")
        except Exception as e:
            log.error("yfinance 事前スキャン 失敗: %s", e)

    def _run_llm_premarket_filter(self) -> None:
        """Claude による寄り付き前フィルタ（気配値ベース）を実行する。

        PRE_MARKET_LLM_TIME（既定 08:30）に1回だけ実行する。無効化されている場合、
        kabu スキャン時刻を過ぎている場合、API呼び出しに失敗した場合はいずれも
        何もせず終了する（フェイルオープン＝既存の候補リストがそのまま使われる）。
        """
        if not PRE_MARKET_LLM_ENABLED:
            return

        now_min  = _hhmm_to_minutes(*_now_hhmm())
        llm_min  = _hhmm_to_minutes(*_parse_hhmm(PRE_MARKET_LLM_TIME))
        kabu_min = _hhmm_to_minutes(*_parse_hhmm(PRE_MARKET_SCAN_TIME))

        if now_min >= kabu_min:
            log.info("kabu スキャン時刻以降のため Claude 寄り付き前フィルタをスキップします")
            return

        if now_min < llm_min:
            _wait_until(PRE_MARKET_LLM_TIME)

        log.info("=== Claude 寄り付き前フィルタ開始 ===")
        try:
            premarket_llm_filter.run(self._client)
        except Exception as e:
            log.error("Claude 寄り付き前フィルタ 失敗（フィルタなしで継続します）: %s", e)

    def _ensure_pre_market_scan(self) -> None:
        """スキャンが必要な場合に実行する（起動タイミング依存のフォールバック付き）。"""
        now_min = _hhmm_to_minutes(*_now_hhmm())
        scan_min = _hhmm_to_minutes(*_parse_hhmm(PRE_MARKET_SCAN_TIME))
        session_start_min = _hhmm_to_minutes(*_parse_hhmm(TRADING_SESSIONS[0]["start"]))

        if now_min < scan_min:
            # スキャン時刻前 → 待機してからスキャン
            _wait_until(PRE_MARKET_SCAN_TIME)
            candidates = _run_pre_market_scan(self._client)
            notifier.notify_scan_complete(candidates, dry_run=self.dry_run)

        elif now_min < session_start_min:
            # スキャン時刻〜取引開始前 → 即時スキャン
            candidates = _run_pre_market_scan(self._client)
            notifier.notify_scan_complete(candidates, dry_run=self.dry_run)

        else:
            # 取引開始後に起動 → DB に当日分があればそれを使用
            existing = db.get_daily_candidates()
            if existing:
                log.info("当日の候補銘柄 %d 件を DB から読み込みました。", len(existing))
            else:
                log.warning("当日候補が DB にありません。即時スキャンを実行します。")
                candidates = _run_pre_market_scan(self._client)
                notifier.notify_scan_complete(candidates, dry_run=self.dry_run)

    def _tick_positions(self) -> None:
        """高頻度ループ（POSITION_CHECK_INTERVAL_SEC 間隔）: 強制クローズ・ポジション監視・PENDING確認。

        損切り/利確は市場価格を毎回ポーリングして判定するため、間隔が長いほど
        設定ラインを超過した価格で約定しやすい。新規エントリー探索（ランキング取得・
        surge評価など重い処理）とは別サイクルにして高頻度に回す。
        """
        now_str = datetime.now().strftime("%H:%M:%S")

        # ① 強制クローズチェック
        if _is_past_or_equal(FORCE_CLOSE_TIME):
            log.info("[%s] 強制クローズ時刻を過ぎました。全ポジションをクローズします。", now_str)
            closed = self._pt.force_close_all(self._om)
            for pos in closed:
                notifier.notify_closed(
                    pos["symbol"], pos.get("symbol_name", ""),
                    pos["close_price"], pos.get("pnl", 0.0), "TIME_LIMIT",
                    dry_run=self.dry_run,
                )
            self._on_shutdown()
            raise SystemExit(0)

        # ② ポジション監視（損切り・利確）
        triggered = self._pt.check_all(self._om)
        for pos in triggered:
            notifier.notify_closed(
                pos["symbol"], pos.get("symbol_name", ""),
                pos["close_price"], pos.get("pnl", 0.0), pos["close_reason"],
                dry_run=self.dry_run,
            )

        # ③ PENDING 注文確認
        filled_list = self._om.check_pending_orders()
        for order in filled_list:
            notifier.notify_filled(
                order["symbol"], order.get("symbol_name", ""),
                order["filled_price"], order["qty"],
                dry_run=self.dry_run,
            )

    def _tick_entries(self) -> None:
        """低頻度ループ（POLLING_INTERVAL 間隔）: 新規エントリー探索（取引セッション内・様子見期間外のみ）。"""
        now_str = datetime.now().strftime("%H:%M:%S")
        if not is_in_trading_session(TRADING_SESSIONS):
            log.debug("[%s] 取引セッション外 — 新規エントリーをスキップ", now_str)
            return
        if _in_entry_embargo(TRADING_SESSIONS, ENTRY_EMBARGO_MIN):
            log.info(
                "[%s] セッション開始直後の様子見期間中（%d分）— 新規エントリーをスキップ",
                now_str, ENTRY_EMBARGO_MIN,
            )
            return
        self._try_new_entries()

    def _try_new_entries(self) -> None:
        """候補から条件を満たす銘柄に買い注文を出す。"""
        _tick_start = time.monotonic()
        # ① リアルタイムスキャンを試みて DB にマージ
        try:
            rankings = fetch_all_rankings(self._client, TRADE_EXCHANGE)
            if not all(len(v) == 0 for v in rankings.values()):
                fresh = merge_and_score(rankings)
                if fresh:
                    db.save_daily_candidates(fresh)
                    log.info("セッション中スキャン: %d 件をマージ", len(fresh))
        except Exception as e:
            log.warning("セッション中スキャン失敗 — キャッシュで継続: %s", e)

        # ② DB から統合済み候補を取得
        raw_candidates = db.get_daily_candidates()
        if not raw_candidates:
            log.warning("候補銘柄リストが空です。")
            return

        # ②-b Claude 寄り付き前フィルタが実行済みなら、明示的に非選定(0)の銘柄を除外する
        # （未評価=NULLの銘柄は対象外にしない＝フィルタ後に新たに現れた候補を締め出さない。
        #   フィルタが未実行・失敗の場合は全銘柄がNULLのままなので、この分岐自体が働かない
        #   ＝フェイルオープン）
        if any(c.get("llm_selected") is not None for c in raw_candidates):
            before = len(raw_candidates)
            raw_candidates = [c for c in raw_candidates if c.get("llm_selected") != 0]
            log.info(
                "Claude寄り付き前フィルタ適用: %d件 → %d件",
                before, len(raw_candidates),
            )

        # ③ 全候補を price フィルタ後に surge 評価
        price_filtered = self._rm.filter_by_price(raw_candidates)

        # ④ surge_score 評価
        self._evaluate_surge_scores(price_filtered)

        # ⑤ 経路D のみ: PRE_SURGE_SETUP（価格未動・出来高先行）
        path_d_symbols: set[str] = set()
        entry_candidates: list[dict] = []
        if PATHD_ENABLED:
            entry_candidates = [
                c for c in price_filtered
                if c.get("surge_signal") == "PRE_SURGE_SETUP"
                and (c.get("volume_spike_ratio") or 0) >= PATHD_MIN_VOLUME_SPIKE
                and (c.get("pre_surge_confirm_count") or 0) >= PATHD_CONFIRM_MIN
            ]
            path_d_symbols = {c.get("symbol") for c in entry_candidates}
            log.info("エントリー候補（経路D）: %d件", len(entry_candidates))

        # ⑥ エントリーループ
        for c in entry_candidates:
            symbol      = c.get("symbol") or ""
            name        = c.get("symbol_name") or ""
            price       = c.get("current_price") or 0
            board_price = c.get("board_price") or price
            entry_path  = "D"

            if board_price <= 0:
                continue

            risk_ok, risk_reason = self._rm.can_enter(symbol, board_price)
            if not risk_ok:
                log.debug("[RISK NG] %s: %s", symbol, risk_reason)
                continue

            policy_ok, policy_reason = policy_check(symbol)
            if not policy_ok:
                log.info("[POLICY NG] %s: %s", symbol, policy_reason)
                continue

            order_id = self._om.place_buy_order(
                symbol, name, board_price, ORDER_QTY, entry_path=entry_path,
                entry_signal={
                    "score": c.get("score"),
                    "surge_score": c.get("surge_score"),
                    "surge_signal": c.get("surge_signal"),
                    "surge_confirm_count": c.get("surge_confirm_count"),
                    "reasons": c.get("reasons"),
                },
            )
            if order_id:
                notifier.notify_order_placed(
                    symbol, name, board_price, ORDER_QTY, dry_run=self.dry_run,
                )
                log.info(
                    "買い注文発注完了: %s %s %.0f円×%d株 (経路%s)",
                    order_id, symbol, board_price, ORDER_QTY, entry_path,
                )

        log.info(
            "新規エントリー探索 完了 (%.1f秒, 候補%d件 → surge評価対象%d件 → エントリー候補%d件)",
            time.monotonic() - _tick_start,
            len(raw_candidates), len(price_filtered), len(entry_candidates),
        )

    def _prefetch_hist_avgs(self, symbols: list[str]) -> None:
        """複数銘柄の20日平均出来高・売買代金をまとめて取得し、キャッシュに格納する。

        1銘柄ずつ yf.download すると銘柄数に比例してネットワーク往復が発生し、
        取引所拡大で候補数が増えた際に tick 全体を長時間（実際には1日で
        surge評価が3回程度しか回らない事態が）ブロックしていた。
        premarket_screener.py と同じ「複数ティッカーをまとめて1回で取得」する
        方式に揃えて解消する。取得・パースに失敗した銘柄は _get_hist_avgs の
        個別フォールバックに委ねる。
        """
        targets = sorted({s for s in symbols if s and s not in self._hist_cache})
        if not targets:
            return

        try:
            import yfinance as yf
            tickers = [f"{s}.T" for s in targets]
            df = yf.download(
                tickers,
                period=f"{SURGE_HIST_DAYS + 5}d",
                interval="1d",
                progress=False,
                auto_adjust=True,
                group_by="ticker",
            )
        except Exception as e:
            log.warning("20日平均の一括取得に失敗しました（個別取得にフォールバックします）: %s", e)
            return

        if df is None or df.empty:
            return

        for symbol in targets:
            ticker = f"{symbol}.T"
            try:
                if len(targets) == 1:
                    sub = df
                else:
                    if ticker not in df.columns.get_level_values(0):
                        continue
                    sub = df[ticker]
                sub = sub.dropna(subset=["Close", "Volume"])
                if len(sub) < SURGE_HIST_DAYS:
                    continue
                recent = sub.iloc[-SURGE_HIST_DAYS:]
                avg_vol = float(recent["Volume"].mean())
                avg_to  = float((recent["Close"] * recent["Volume"]).mean())
                self._hist_cache[symbol] = (avg_vol, avg_to)
            except Exception:
                continue

    def _get_hist_avgs(self, symbol: str) -> tuple[float, float]:
        """yfinance から 20 日平均出来高・売買代金を返す（セッション内キャッシュ付き）。

        通常は _evaluate_surge_scores が呼ぶ _prefetch_hist_avgs で事前に
        キャッシュ済みのはずで、ここは一括取得で解決できなかった銘柄の
        個別フォールバック。
        """
        if symbol in self._hist_cache:
            return self._hist_cache[symbol]
        try:
            import yfinance as yf
            df = yf.download(
                f"{symbol}.T",
                period=f"{SURGE_HIST_DAYS + 5}d",
                interval="1d",
                progress=False,
                auto_adjust=True,
                multi_level_index=False,
            )
            if df is not None and len(df) >= SURGE_HIST_DAYS:
                recent = df.iloc[-SURGE_HIST_DAYS:]
                avg_vol = float(recent["Volume"].mean())
                avg_to  = float((recent["Close"] * recent["Volume"]).mean())
            else:
                avg_vol, avg_to = 0.0, 0.0
        except Exception:
            avg_vol, avg_to = 0.0, 0.0
        self._hist_cache[symbol] = (avg_vol, avg_to)
        return avg_vol, avg_to

    def _evaluate_surge_scores(self, candidates: list[dict]) -> None:
        """候補銘柄の surge_score を評価して DB に保存し、LINE 通知する。"""
        if not candidates:
            return

        _hist_start = time.monotonic()
        self._prefetch_hist_avgs([c.get("symbol", "") for c in candidates if c.get("symbol")])
        log.info(
            "20日平均の一括取得 完了 (%.1f秒, %d銘柄)",
            time.monotonic() - _hist_start, len(candidates),
        )

        board_fail_count = 0

        for c in candidates:
            symbol = c.get("symbol", "")
            name   = c.get("symbol_name") or ""
            score  = c.get("score") or 0.0
            price  = float(c.get("current_price") or 0)
            if not symbol or price <= 0:
                continue

            # /board からリアルタイムデータを取得（EXCHANGE_CODE=1: 東証）
            # 失敗時は板価格ゼロ埋め等の誤った surge_score を保存すると
            # 実際は急騰中でも NO_SURGE と誤判定されるため、今回のtickは
            # スキップして次回に賭ける（既存の保存値を上書きしない）。
            try:
                board = self._client.get(f"/board/{symbol}@1")
            except Exception as e:
                board_fail_count += 1
                log.warning("board取得失敗 %s: %s — 今回のsurge評価をスキップします", symbol, e)
                continue

            if not board:
                board_fail_count += 1
                log.warning("board取得: %s の応答が空です — 今回のsurge評価をスキップします", symbol)
                continue

            today_volume   = float(board.get("TradingVolume") or 0)
            today_turnover = float(board.get("TradingValue") or board.get("Turnover") or 0)
            day_high       = float(board.get("HighPrice") or board.get("DayHigh") or price)
            vwap           = board.get("VWAP") or board.get("Vwap")
            vwap           = float(vwap) if vwap else None
            cur_price      = float(board.get("CurrentPrice") or price)
            # ⑥エントリー時に板価格を使えるよう candidate dict に保存
            c["board_price"] = cur_price

            # 1 分足終値リスト: board価格履歴を使用（60秒ポーリング ≒ 1分足）
            price_cache.update(symbol, cur_price)
            closes_1m = price_cache.get(symbol)

            # 20 日平均
            avg_vol, avg_to = self._get_hist_avgs(symbol)

            prev_score = db.get_previous_surge_score(symbol)

            try:
                result = calculate_surge_score(
                    symbol=symbol,
                    current_price=cur_price,
                    day_high=day_high,
                    today_volume=today_volume,
                    today_turnover=today_turnover,
                    vwap=vwap,
                    closes_1m=closes_1m,
                    avg_volume_20d=avg_vol,
                    avg_turnover_20d=avg_to,
                    previous_surge_score=prev_score,
                )
            except Exception as e:
                log.warning("surge_score 計算失敗 %s: %s", symbol, e)
                continue

            db.save_surge_score(
                symbol=symbol,
                surge_score=result.surge_score,
                surge_signal=result.surge_signal,
                surge_reason=result.surge_reason,
                surge_score_delta=result.surge_score_delta,
                volume_spike_ratio=result.volume_spike_ratio,
                turnover_spike_ratio=result.turnover_spike_ratio,
                price_change_1m=result.price_change_1m,
                price_change_3m=result.price_change_3m,
                price_change_5m=result.price_change_5m,
                near_day_high_ratio=result.near_day_high_ratio,
                vwap_position=result.vwap_position,
            )

            # candidate dict に surge 結果を反映（⑤フィルタで使う）
            c["surge_score"]  = result.surge_score
            c["surge_signal"] = result.surge_signal

            # 連続確認カウント更新（瞬間値誤エントリー防止）
            if result.surge_signal in ("SURGE_CANDIDATE", "SURGE_STRONG"):
                self._surge_confirm[symbol] = self._surge_confirm.get(symbol, 0) + 1
            else:
                self._surge_confirm[symbol] = 0
            c["surge_confirm_count"] = self._surge_confirm.get(symbol, 0)

            # 経路D: PRE_SURGE_SETUP 連続確認カウント
            if result.surge_signal == "PRE_SURGE_SETUP":
                self._pre_surge_confirm[symbol] = self._pre_surge_confirm.get(symbol, 0) + 1
            else:
                self._pre_surge_confirm[symbol] = 0
            c["pre_surge_confirm_count"] = self._pre_surge_confirm.get(symbol, 0)

            log.info(
                "[SURGE] %s %s: %.0f (%s) confirm=%d vol=%.1fx to=%.1fx 1m=%+.2f%% 5m=%+.2f%%",
                symbol, name, result.surge_score, result.surge_signal,
                c["surge_confirm_count"],
                result.volume_spike_ratio, result.turnover_spike_ratio,
                result.price_change_1m, result.price_change_5m,
            )

            # LINE 通知: surge_notify_enabled=true かつ条件を満たす場合のみ送信
            prev_signal = self._surge_notified_signal.get(symbol, "")
            if SURGE_NOTIFY_ON_TRANSITION_ONLY:
                # シグナルが上位ステータスに遷移したときのみ通知（維持中はdeltaのみ）
                _SIGNAL_RANK = {"": 0, "NO_SURGE": 0, "SURGE_WATCH": 1, "SURGE_CANDIDATE": 2, "SURGE_STRONG": 3}
                signal_upgraded = _SIGNAL_RANK.get(result.surge_signal, 0) > _SIGNAL_RANK.get(prev_signal, 0)
                should_notify = SURGE_NOTIFY_ENABLED and (
                    signal_upgraded
                    or result.surge_score_delta >= SURGE_NOTIFY_DELTA
                )
            else:
                should_notify = SURGE_NOTIFY_ENABLED and (
                    result.surge_signal in ("SURGE_CANDIDATE", "SURGE_STRONG")
                    or result.surge_score_delta >= SURGE_NOTIFY_DELTA
                )
            if result.surge_signal in ("NO_SURGE", ""):
                self._surge_notified_signal.pop(symbol, None)
            elif should_notify:
                self._surge_notified_signal[symbol] = result.surge_signal
            if should_notify:
                notifier.notify_surge_candidate(
                    symbol=symbol,
                    name=name,
                    current_price=cur_price,
                    score=score,
                    surge_score=result.surge_score,
                    surge_signal=result.surge_signal,
                    surge_score_delta=result.surge_score_delta,
                    volume_spike_ratio=result.volume_spike_ratio,
                    turnover_spike_ratio=result.turnover_spike_ratio,
                    price_change_1m=result.price_change_1m,
                    price_change_3m=result.price_change_3m,
                    price_change_5m=result.price_change_5m,
                    surge_reason=result.surge_reason,
                    dry_run=self.dry_run,
                )

        if board_fail_count:
            log.warning(
                "surge評価: %d/%d 銘柄で board 取得に失敗しました（kabuステーションの接続状況を確認してください）",
                board_fail_count, len(candidates),
            )

    def _on_shutdown(self) -> None:
        """終了時の後処理: 日次サマリー更新・LINE レポート送信。（重複呼び出し防止済み）"""
        if self._shutdown_done:
            return
        self._shutdown_done = True
        try:
            closed    = db.get_today_closed_positions(dry_run=self.dry_run)
            open_pos  = db.get_open_positions(dry_run=self.dry_run)
            today_pnl = db.get_today_closed_pnl(dry_run=self.dry_run)
            cand_count = len(db.get_daily_candidates())

            total = len(closed)
            wins  = sum(1 for p in closed if (p.get("pnl") or 0) >= 0)

            if open_pos:
                log.warning("未決済ポジション %d 件が残っています。", len(open_pos))

            db.upsert_daily_summary(total, wins, total - wins, today_pnl)
            notifier.notify_daily_report(closed, open_pos, cand_count, dry_run=self.dry_run)
        except Exception as e:
            log.warning("日次サマリー更新失敗: %s", e)

        if self.dry_run:
            self._print_dry_run_report()

    def _print_dry_run_report(self) -> None:
        import sqlite3
        from datetime import date as _date
        try:
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                """SELECT symbol, symbol_name, entry_price, close_price,
                          close_reason, pnl, pnl_pct
                   FROM positions
                   WHERE status='CLOSED' AND DATE(closed_at)=? AND dry_run=1""",
                (_date.today().isoformat(),),
            ).fetchall()
            conn.close()
        except Exception:
            return

        width = 60
        print(f"\n{'=' * width}")
        print("  [DRY-RUN] 検証レポート")
        print(f"{'=' * width}")
        total_pnl = 0.0
        wins = 0
        for r in rows:
            sign = "+" if (r[5] or 0) >= 0 else ""
            if (r[5] or 0) >= 0:
                wins += 1
            total_pnl += r[5] or 0
            print(f"  {r[0]} {(r[1] or '')[:8]:<8} "
                  f"エントリー{r[2]:.0f}→決済{(r[3] or 0):.0f}円  "
                  f"損益{sign}{(r[5] or 0):.0f}円 [{r[4]}]")
        trades = len(rows)
        rate = wins / trades * 100 if trades else 0.0
        sign = "+" if total_pnl >= 0 else ""
        print(f"{'─' * width}")
        print(f"  取引数: {trades}  勝率: {rate:.0f}%  損益合計: {sign}{total_pnl:.0f}円")
        print(f"{'=' * width}\n")
