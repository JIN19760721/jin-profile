"""
ポジション管理・損益計算・損切り/利確判定（経路D専用）。

利確ロジック:

  高値時点の含み益(peak_pnl_pct)に応じて防御ライン(floor_pct)が段階的に切り上がる:
    peak_pnl_pct <  tp_pct * 0.25   → 防御なし（sl_pct のみ）
    peak_pnl_pct >= tp_pct * 0.25   → ブレークイーブン確保（floor = breakeven_floor_pct）
    peak_pnl_pct >= tp_pct * 0.50   → 部分トレーリング（floor = peak_pnl_pct - partial_trail_pct）
    peak_pnl_pct >= tp_pct          → キープゾーン突入

  キープゾーン内の判定（60秒サイクルの refresh_claude_judgments() がキャッシュを更新）:
    ├─ 高値から -N%（トレーリングストップ）→ 即利確（TAKE_PROFIT_TRAIL）
    ├─ surge 上昇基調継続               → HOLD キャッシュ（Claude 呼ばず）
    └─ モメンタム低下検知               → Claude が最終判断（TAKE_PROFIT or HOLD）

  ※ キープゾーンは一度到達したら損切りラインに触れるかトレーリング/Claudeで
    決済されるまで維持する。
"""

import logging
from datetime import datetime

from src import db, claude_tp_advisor
from src.config import (
    PROFIT_LOCK_BREAKEVEN_FLOOR_PCT,
    PROFIT_LOCK_BREAKEVEN_TRIGGER_RATIO,
    PROFIT_LOCK_PARTIAL_TRAIL_PCT,
    PROFIT_LOCK_PARTIAL_TRIGGER_RATIO,
    STOP_LOSS_PCT_D,
    TAKE_PROFIT_PCT_D,
    TAKE_PROFIT_TRAILING_PCT,
)
from src.kabu_client import KabuClient

log = logging.getLogger(__name__)

EXCHANGE_CODE = 1


class PositionTracker:
    def __init__(self, client: KabuClient, dry_run: bool = False) -> None:
        self._client = client
        self.dry_run = dry_run
        # symbol → 当日高値（トレーリングストップ用）
        self._peak_prices: dict[str, float] = {}
        # 一度でも tp_pct に到達した symbol の集合（キープゾーンを維持するため）
        self._keep_zone: set[str] = set()
        # 60秒サイクルで更新されるClaude利確判断キャッシュ
        self._claude_decisions: dict[str, str] = {}   # symbol → "TAKE_PROFIT" | "HOLD"
        self._claude_reasons:   dict[str, str] = {}   # symbol → 理由文字列
        # check_all() で取得した直近価格（同一tickでの board API 二重呼び出しを防ぐ）
        self._last_price: dict[str, float] = {}
        self._restore_state_from_db()

    def _restore_state_from_db(self) -> None:
        """再起動時、DBに永続化されたmax_pnl_pctから高値・キープゾーン状態を復元する。

        _peak_prices/_keep_zoneはプロセス内メモリのみで管理しているため、再起動すると
        失われ、利確ラインを一度超えた後のポジションの保護が弱まる問題があった。
        _claude_decisions/_claude_reasonsはデフォルトのHOLD（安全側）で始まり
        次のrefresh_claude_judgments()サイクルで再計算されるため復元不要。
        """
        for pos in db.get_open_positions(dry_run=self.dry_run):
            symbol = pos["symbol"]
            max_pnl_pct = pos.get("max_pnl_pct")
            if max_pnl_pct is None:
                continue
            entry = pos["entry_price"]
            peak_price = entry * (1 + max_pnl_pct / 100)
            self._peak_prices[symbol] = peak_price
            if max_pnl_pct >= TAKE_PROFIT_PCT_D:
                self._keep_zone.add(symbol)
            log.info(
                "状態復元: %s 高値%.0f円(過去最大含み益%+.2f%%) keep_zone=%s",
                symbol, peak_price, max_pnl_pct, symbol in self._keep_zone,
            )

    def get_current_price(self, symbol: str) -> float | None:
        """/board から現在値を取得する。"""
        try:
            data = self._client.get(f"/board/{symbol}@{EXCHANGE_CODE}")
            price = data.get("CurrentPrice") or data.get("BestAsk1")
            return float(price) if price else None
        except Exception as e:
            log.warning("現在値取得失敗 %s: %s", symbol, e)
            return None

    def check_all(self, order_manager) -> list[dict]:
        """全 OPEN ポジションをチェックし、損切り/利確トリガーを返す。"""
        positions = db.get_open_positions(dry_run=self.dry_run)
        triggered: list[dict] = []

        for pos in positions:
            symbol = pos["symbol"]
            entry  = pos["entry_price"]
            sl_pct = STOP_LOSS_PCT_D
            tp_pct = TAKE_PROFIT_PCT_D

            current = self.get_current_price(symbol)
            if current is None:
                continue
            self._last_price[symbol] = current

            pnl_pct = (current - entry) / entry * 100
            db.update_position_max_pnl_pct(symbol, pnl_pct, dry_run=self.dry_run)

            # ── 高値を更新 ───────────────────────────────────────────────
            peak = max(self._peak_prices.get(symbol, entry), current)
            self._peak_prices[symbol] = peak
            peak_pnl_pct = (peak - entry) / entry * 100

            # ── キープゾーン到達判定（一度到達したら維持する）────────────
            if pnl_pct >= tp_pct:
                self._keep_zone.add(symbol)

            # ── 利益ロック床の算出（tp_pct 未到達の間のみ機能）──────────
            floor_pct = sl_pct
            if peak_pnl_pct < tp_pct:
                if peak_pnl_pct >= tp_pct * PROFIT_LOCK_PARTIAL_TRIGGER_RATIO:
                    floor_pct = max(floor_pct, peak_pnl_pct - PROFIT_LOCK_PARTIAL_TRAIL_PCT)
                elif peak_pnl_pct >= tp_pct * PROFIT_LOCK_BREAKEVEN_TRIGGER_RATIO:
                    floor_pct = max(floor_pct, PROFIT_LOCK_BREAKEVEN_FLOOR_PCT)

            # ── 損切り／利益ロック ───────────────────────────────────────
            if pnl_pct <= floor_pct:
                reason = "STOP_LOSS" if floor_pct <= sl_pct else "TAKE_PROFIT_LOCK"

            # ── キープゾーン: トレーリング優先 → キャッシュ済みClaude判断 ─
            elif symbol in self._keep_zone:
                trailing_drop = (peak - current) / peak * 100
                if trailing_drop >= TAKE_PROFIT_TRAILING_PCT:
                    reason = "TAKE_PROFIT_TRAIL"
                else:
                    action        = self._claude_decisions.get(symbol, "HOLD")
                    claude_reason = self._claude_reasons.get(symbol, "判断待ち")
                    if action == "TAKE_PROFIT":
                        reason = "TAKE_PROFIT"
                    else:
                        log.info(
                            "キープ継続: %s %+.2f%% 高値%.0f (押し%.2f%%) — %s",
                            symbol, pnl_pct, peak, trailing_drop, claude_reason,
                        )
                        continue

            else:
                log.debug("監視中: %s 損益率 %+.2f%% (高値%+.2f%%)", symbol, pnl_pct, peak_pnl_pct)
                continue

            # ── クローズ実行 ─────────────────────────────────────────────
            pnl = (current - entry) * pos["qty"]
            log.info(
                "%s: %s 損益率 %+.2f%% 損益 %+.0f円",
                reason, symbol, pnl_pct, pnl,
            )
            order_id = order_manager.place_sell_order(
                symbol, pos.get("symbol_name") or "", current, pos["qty"]
            )
            if order_id is None:
                log.error("%s: 売り注文発行に失敗しました。OPENのまま維持し次tickで再試行します。", symbol)
                continue

            self._peak_prices.pop(symbol, None)
            self._keep_zone.discard(symbol)
            self._claude_decisions.pop(symbol, None)
            self._claude_reasons.pop(symbol, None)

            if self.dry_run:
                # DRY-RUNは即仮約定するため従来通り即CLOSEDにする
                db.close_position(symbol, current, reason, pnl, pnl_pct)
                triggered.append({
                    **pos,
                    "close_price":  current,
                    "close_reason": reason,
                    "pnl":          pnl,
                    "pnl_pct":      pnl_pct,
                })
            else:
                # 本番は約定未確認のためCLOSING状態にし、order_manager.check_pending_orders()
                # による約定確認後に確定させる（板が薄く売れないケースへの対策）
                db.mark_position_closing(symbol, order_id, reason, dry_run=False)

        return triggered

    def refresh_claude_judgments(self) -> None:
        """60秒サイクルで呼ぶ: キープゾーン中ポジションの利確判断をキャッシュする。

        surge データが上昇基調を示す間は HOLD をキャッシュ（Claude 呼び出しなし）。
        モメンタム低下を検知した時点で初めて Claude に最終判断させる。
        """
        positions = db.get_open_positions(dry_run=self.dry_run)
        for pos in positions:
            symbol = pos["symbol"]
            if symbol not in self._keep_zone:
                continue

            surge_data      = db.get_latest_surge_data(symbol) or {}
            surge_signal    = surge_data.get("surge_signal") or "NO_SURGE"
            price_change_1m = surge_data.get("price_change_1m") or 0.0
            near_day_high   = surge_data.get("near_day_high_ratio") or 0.0

            # 上昇基調: surge が強く、直近1分で価格上昇中、かつ高値圏でない
            uptrend = (
                surge_signal in ("SURGE_STRONG", "SURGE_CANDIDATE", "PRE_SURGE_SETUP")
                and price_change_1m > 0
                and near_day_high < 0.99
            )

            if uptrend:
                self._claude_decisions[symbol] = "HOLD"
                self._claude_reasons[symbol] = (
                    f"上昇継続 ({surge_signal}, 1m:{price_change_1m:+.2f}%)"
                )
                log.info("キープ判断: %s 上昇基調継続 → HOLD (%s)", symbol, surge_signal)
                continue

            # モメンタム低下 → Claude に最終判断を委ねる
            entry   = pos["entry_price"]
            current = self._last_price.get(symbol) or self.get_current_price(symbol)
            if current is None:
                continue

            peak         = self._peak_prices.get(symbol, current)
            pnl_pct      = (current - entry) / entry * 100
            peak_pnl_pct = (peak    - entry) / entry * 100
            held_min = (
                datetime.now() - datetime.fromisoformat(pos["opened_at"])
            ).total_seconds() / 60

            action, reason = claude_tp_advisor.advise(
                symbol=symbol,
                name=pos.get("symbol_name") or "",
                entry_price=entry,
                current_price=current,
                pnl_pct=pnl_pct,
                peak_pnl_pct=peak_pnl_pct,
                held_minutes=held_min,
                surge_data=surge_data,
            )
            self._claude_decisions[symbol] = action
            self._claude_reasons[symbol]   = reason
            log.info(
                "キープ判断: %s モメンタム低下 → Claude: %s (%s)",
                symbol, action, reason,
            )

    def force_close_all(self, order_manager) -> list[dict]:
        """強制クローズ: 全 OPEN ポジションに売り注文を発行する。

        DRY-RUNは即仮約定するため従来通り即CLOSEDにするが、本番は約定未確認のため
        CLOSING状態にするだけで、確定は order_manager.check_pending_orders() に委ねる
        （呼び出し側は約定確認ループを回すこと）。
        """
        positions = db.get_open_positions(dry_run=self.dry_run)
        closed: list[dict] = []

        for pos in positions:
            symbol  = pos["symbol"]
            current = self.get_current_price(symbol) or pos["entry_price"]
            order_id = order_manager.place_sell_order(
                symbol, pos.get("symbol_name") or "", current, pos["qty"]
            )
            if order_id is None:
                log.error("%s: 強制クローズの売り注文発行に失敗しました。手動確認が必要です。", symbol)
                continue

            self._peak_prices.pop(symbol, None)
            self._keep_zone.discard(symbol)
            self._claude_decisions.pop(symbol, None)
            self._claude_reasons.pop(symbol, None)

            if self.dry_run:
                pnl     = (current - pos["entry_price"]) * pos["qty"]
                pnl_pct = (current - pos["entry_price"]) / pos["entry_price"] * 100
                db.close_position(symbol, current, "TIME_LIMIT", pnl, pnl_pct)
                closed.append({**pos, "close_price": current, "pnl": pnl, "pnl_pct": pnl_pct})
                log.info("強制クローズ: %s %.0f円 損益 %+.0f円", symbol, current, pnl)
            else:
                db.mark_position_closing(symbol, order_id, "TIME_LIMIT", dry_run=False)
                log.info("強制クローズ注文発行: %s @ %.0f円（約定確認待ち）", symbol, current)

        return closed
