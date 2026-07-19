"""
発注可否の判断: 利用可能資金・最大保有数・日次損失上限チェック。

利用可能資金の計算:
  利用可能資金 = 初期資金
               - Σ(保有中ポジションの取得コスト)
               + 当日の実現損益合計

  例: 資金10万円、2492を46,500円で保有中 → 利用可能 = 53,500円
  例: 9509を97,400円で追加しようとした場合 → 53,500円未満なので NG
  例: 2492を47,000円で売却（PnL +500円）→ 利用可能 = 53,500 + 47,000 = 100,500円
"""

import logging
from datetime import datetime

from src import db
from src.config import (
    CAPITAL,
    DAILY_LOSS_LIMIT,
    MAX_POSITIONS,
    ORDER_QTY,
    REENTRY_COOLDOWN_MIN,
)

log = logging.getLogger(__name__)


class RiskManager:
    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run

    def available_capital(self) -> float:
        """現時点の利用可能資金を返す。

        実効資金 = 初期資金 + max(0, 累積損益)  ← 利益分を翌日以降も引き継ぐ
        利用可能  = 実効資金 - 保有中ポジションの取得コスト
        """
        open_positions = db.get_open_positions(dry_run=self.dry_run)
        open_cost = sum(p["entry_price"] * p["qty"] for p in open_positions)
        cumulative_pnl = db.get_cumulative_pnl(dry_run=self.dry_run)
        effective_capital = CAPITAL + max(0.0, cumulative_pnl)
        return effective_capital - open_cost

    def can_enter(self, symbol: str, current_price: float) -> tuple[bool, str]:
        """エントリー可否を判定する。(ok, reason) を返す。"""
        # ① 利用可能資金チェック（動的: 保有コストと実現損益を反映）
        avail = self.available_capital()
        order_cost = current_price * ORDER_QTY
        if order_cost > avail:
            return False, (
                f"購入必要額 {order_cost:.0f}円 > 利用可能資金 {avail:.0f}円 "
                f"(初期資金 {CAPITAL:.0f}円)"
            )

        # ② 既存ポジション重複
        if db.has_open_position(symbol, dry_run=self.dry_run):
            return False, f"{symbol} は既に保有中"

        # ③ 最大保有数
        open_count = len(db.get_open_positions(dry_run=self.dry_run))
        if open_count >= MAX_POSITIONS:
            return False, f"最大保有数 {MAX_POSITIONS} 銘柄に達しています"

        # ④ 日次損失上限
        today_pnl = db.get_today_closed_pnl(dry_run=self.dry_run)
        if today_pnl <= DAILY_LOSS_LIMIT:
            return False, (
                f"日次損失 {today_pnl:.0f}円 が上限 {DAILY_LOSS_LIMIT:.0f}円 を超過"
            )

        # ⑤ 同一銘柄クールダウン（当日決済直後の即再エントリーを防ぐ）
        if REENTRY_COOLDOWN_MIN > 0:
            last_closed_at = db.get_last_closed_time_today(symbol, dry_run=self.dry_run)
            if last_closed_at is not None:
                elapsed_min = (
                    datetime.now() - datetime.strptime(last_closed_at, "%Y-%m-%d %H:%M:%S")
                ).total_seconds() / 60
                if elapsed_min < REENTRY_COOLDOWN_MIN:
                    return False, (
                        f"{symbol} は{elapsed_min:.0f}分前に決済済み "
                        f"(クールダウン{REENTRY_COOLDOWN_MIN}分未満)"
                    )

        return True, "OK"

    def filter_by_price(self, candidates: list[dict]) -> list[dict]:
        """現時点の利用可能資金で買えない銘柄を除外する。"""
        avail = self.available_capital()
        cumulative_pnl = db.get_cumulative_pnl(dry_run=self.dry_run)
        effective_capital = CAPITAL + max(0.0, cumulative_pnl)
        max_price = effective_capital / ORDER_QTY
        log.info(
            "利用可能資金: %.0f円 (初期資金 %.0f円 + 累積損益 %.0f円 → 上限株価 %.0f円)",
            avail, CAPITAL, cumulative_pnl, max_price,
        )
        result = []
        for c in candidates:
            price = c.get("CurrentPrice") or c.get("current_price") or 0
            order_cost = price * ORDER_QTY
            if order_cost <= avail:
                result.append(c)
            else:
                log.debug(
                    "資金不足で除外: %s %.0f円×%d株=%.0f円 > 利用可能 %.0f円",
                    c.get("Symbol") or c.get("symbol", ""), price, ORDER_QTY,
                    order_cost, avail,
                )
        return result
