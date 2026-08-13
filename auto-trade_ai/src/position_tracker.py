"""
ポジション管理・損益計算・損切り/利確判定。

利確ロジック（経路A/Bのみ。経路Cは即利確でキープゾーン・利益ロックとも対象外）:

  高値時点の含み益(peak_pnl_pct)に応じて防御ライン(floor_pct)が段階的に切り上がる:
    peak_pnl_pct <  tp_pct * 0.25   → 防御なし（sl_pct のみ = 通常の損切りライン）
    peak_pnl_pct >= tp_pct * 0.25   → ブレークイーブン確保（floor = breakeven_floor_pct）
    peak_pnl_pct >= tp_pct * 0.50   → 部分トレーリング（floor = peak_pnl_pct - partial_trail_pct）
    peak_pnl_pct >= tp_pct          → キープゾーン突入（以後 pnl_pct が tp_pct を割り込んでも維持）
      ├─ RCI ≥ +80                 → 利確（TAKE_PROFIT）
      ├─ 高値から -N%               → 強制利確（TAKE_PROFIT_TRAIL）
      └─ それ以外                   → キープ継続

  ※ tp_pct 到達前は「無防備地帯」対策として floor_pct のみで判定する
    （TAKE_PROFIT_LOCK）。tp_pct 到達後はキープゾーン側のトレーリング/RCIに一任する。
  ※ キープゾーンは一度到達したら損切りラインに触れるかトレーリング/RCIで
    決済されるまで維持する（ポーリングの間に pnl_pct が利確ラインを
    跨いで上下しただけでキープ判定が抜け落ちないようにするため）。
"""

import logging
from datetime import datetime

from src import db, claude_tp_advisor
from src.config import (
    PROFIT_LOCK_BREAKEVEN_FLOOR_PCT,
    PROFIT_LOCK_BREAKEVEN_TRIGGER_RATIO,
    PROFIT_LOCK_PARTIAL_TRAIL_PCT,
    PROFIT_LOCK_PARTIAL_TRIGGER_RATIO,
    STOP_LOSS_PCT,
    STOP_LOSS_PCT_B,
    STOP_LOSS_PCT_C,
    STOP_LOSS_PCT_D,
    TAKE_PROFIT_PCT,
    TAKE_PROFIT_PCT_B,
    TAKE_PROFIT_PCT_C,
    TAKE_PROFIT_PCT_D,
    TAKE_PROFIT_TRAILING_PCT,
)
from src.entry_policy import check_rci_overbought
from src.kabu_client import KabuClient

log = logging.getLogger(__name__)

EXCHANGE_CODE = 1


class PositionTracker:
    def __init__(self, client: KabuClient, dry_run: bool = False) -> None:
        self._client = client
        self.dry_run = dry_run
        # symbol → 当日高値（キープゾーン用トレーリングストップ）
        self._peak_prices: dict[str, float] = {}
        # 一度でも tp_pct に到達した symbol の集合（キープゾーンを維持するため）
        self._keep_zone: set[str] = set()

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
            path   = pos.get("entry_path", "A")
            if path == "D":
                sl_pct = STOP_LOSS_PCT_D
                tp_pct = TAKE_PROFIT_PCT_D
            elif path == "C":
                sl_pct = STOP_LOSS_PCT_C
                tp_pct = TAKE_PROFIT_PCT_C
            elif path == "B":
                sl_pct = STOP_LOSS_PCT_B
                tp_pct = TAKE_PROFIT_PCT_B
            else:
                sl_pct = STOP_LOSS_PCT
                tp_pct = TAKE_PROFIT_PCT

            current = self.get_current_price(symbol)
            if current is None:
                continue

            pnl_pct = (current - entry) / entry * 100
            db.update_position_max_pnl_pct(symbol, pnl_pct, dry_run=self.dry_run)

            # ── 高値を更新 ───────────────────────────────────────────────
            peak = max(self._peak_prices.get(symbol, entry), current)
            self._peak_prices[symbol] = peak
            peak_pnl_pct = (peak - entry) / entry * 100

            # ── キープゾーン到達判定（経路A/Bのみ。一度到達したら維持する）──
            # 経路C/D: キープゾーンなし（tp_pct到達で即利確）
            if path not in ("C", "D") and pnl_pct >= tp_pct:
                self._keep_zone.add(symbol)

            # ── 利益ロック床の算出（経路A/Bのみ、tp_pct未到達の間だけ機能）──
            floor_pct = sl_pct
            if path not in ("C", "D") and peak_pnl_pct < tp_pct:
                if peak_pnl_pct >= tp_pct * PROFIT_LOCK_PARTIAL_TRIGGER_RATIO:
                    floor_pct = max(floor_pct, peak_pnl_pct - PROFIT_LOCK_PARTIAL_TRAIL_PCT)
                elif peak_pnl_pct >= tp_pct * PROFIT_LOCK_BREAKEVEN_TRIGGER_RATIO:
                    floor_pct = max(floor_pct, PROFIT_LOCK_BREAKEVEN_FLOOR_PCT)

            # ── 損切り／利益ロック ───────────────────────────────────────
            if pnl_pct <= floor_pct:
                reason = "STOP_LOSS" if floor_pct <= sl_pct else "TAKE_PROFIT_LOCK"

            # ── 利確判定（経路C: 即利確） ─────────────────────────────
            elif path == "C":
                if pnl_pct >= tp_pct:
                    reason = "TAKE_PROFIT"
                else:
                    log.debug("監視中: %s 損益率 %+.2f%%", symbol, pnl_pct)
                    continue

            # ── 利確判定（経路D: Claude判断 → HOLD ならトレーリング） ──
            elif path == "D":
                if symbol not in self._keep_zone and pnl_pct >= tp_pct:
                    surge_data = db.get_latest_surge_data(symbol) or {}
                    held_min = (
                        datetime.now() - datetime.fromisoformat(pos["opened_at"])
                    ).total_seconds() / 60
                    action, claude_reason = claude_tp_advisor.advise(
                        symbol=symbol,
                        name=pos.get("symbol_name") or "",
                        entry_price=entry,
                        current_price=current,
                        pnl_pct=pnl_pct,
                        peak_pnl_pct=peak_pnl_pct,
                        held_minutes=held_min,
                        surge_data=surge_data,
                    )
                    if action == "TAKE_PROFIT":
                        reason = "TAKE_PROFIT"
                    else:
                        self._keep_zone.add(symbol)
                        log.info(
                            "[経路D] %s Claude→HOLD: %s / トレーリングストップに移行",
                            symbol, claude_reason,
                        )
                        continue
                elif symbol in self._keep_zone:
                    # HOLD後: トレーリングストップのみで管理
                    trailing_drop = (peak - current) / peak * 100
                    if trailing_drop >= TAKE_PROFIT_TRAILING_PCT:
                        reason = "TAKE_PROFIT_TRAIL"
                    else:
                        log.debug(
                            "[経路D] キープ: %s %+.2f%% 高値%.0f (押し%.2f%%)",
                            symbol, pnl_pct, peak, trailing_drop,
                        )
                        continue
                else:
                    log.debug("監視中(D): %s 損益率 %+.2f%%", symbol, pnl_pct)
                    continue

            elif symbol in self._keep_zone:
                reason = self._check_take_profit(symbol, current, peak, pnl_pct)
                if reason is None:
                    continue  # キープ継続

            else:
                log.debug("監視中: %s 損益率 %+.2f%% (高値%+.2f%%)", symbol, pnl_pct, peak_pnl_pct)
                continue

            # ── クローズ実行 ─────────────────────────────────────────────
            pnl = (current - entry) * pos["qty"]
            log.info(
                "%s: %s 損益率 %+.2f%% 損益 %+.0f円",
                reason, symbol, pnl_pct, pnl,
            )
            order_manager.place_sell_order(
                symbol, pos.get("symbol_name") or "", current, pos["qty"]
            )
            db.close_position(symbol, current, reason, pnl, pnl_pct)
            self._peak_prices.pop(symbol, None)
            self._keep_zone.discard(symbol)
            triggered.append({
                **pos,
                "close_price":  current,
                "close_reason": reason,
                "pnl":          pnl,
                "pnl_pct":      pnl_pct,
            })

        return triggered

    def _check_take_profit(
        self,
        symbol: str,
        current: float,
        peak: float,
        pnl_pct: float,
    ) -> str | None:
        """
        キープゾーン内の利確判定。

        Returns
        -------
        str   : クローズ理由（"TAKE_PROFIT" or "TAKE_PROFIT_TRAIL"）
        None  : キープ継続
        """
        # ① トレーリングストップ（高値から -N% 押し）
        trailing_drop = (peak - current) / peak * 100
        if trailing_drop >= TAKE_PROFIT_TRAILING_PCT:
            log.info(
                "トレーリングストップ: %s 高値%.0f→現在%.0f (%.2f%%押し)",
                symbol, peak, current, trailing_drop,
            )
            return "TAKE_PROFIT_TRAIL"

        # ② RCI 過買い判定（yfinance 失敗時は強制利確）
        rci_overbought, rci_detail = check_rci_overbought(symbol)
        if rci_overbought:
            log.info("RCI利確: %s %+.2f%% — %s", symbol, pnl_pct, rci_detail)
            return "TAKE_PROFIT"

        # キープ
        log.info(
            "キープゾーン: %s 損益率 %+.2f%% 高値%.0f — %s",
            symbol, pnl_pct, peak, rci_detail,
        )
        return None

    def force_close_all(self, order_manager) -> list[dict]:
        """強制クローズ: 全 OPEN ポジションに売り注文を発行する。"""
        positions = db.get_open_positions(dry_run=self.dry_run)
        closed: list[dict] = []

        for pos in positions:
            symbol  = pos["symbol"]
            current = self.get_current_price(symbol) or pos["entry_price"]
            pnl     = (current - pos["entry_price"]) * pos["qty"]
            pnl_pct = (current - pos["entry_price"]) / pos["entry_price"] * 100
            order_manager.place_sell_order(
                symbol, pos.get("symbol_name") or "", current, pos["qty"]
            )
            db.close_position(symbol, current, "TIME_LIMIT", pnl, pnl_pct)
            self._peak_prices.pop(symbol, None)
            self._keep_zone.discard(symbol)
            closed.append({**pos, "close_price": current, "pnl": pnl, "pnl_pct": pnl_pct})
            log.info("強制クローズ: %s %.0f円 損益 %+.0f円", symbol, current, pnl)

        return closed
