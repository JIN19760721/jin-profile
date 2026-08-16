"""
kabu API への発注・取消・約定確認を担う。
dry_run=True のとき実際の API コールを行わず即時仮約定として DB に記録する。
"""

import logging
from datetime import datetime

from src import db
from src.config import (
    ACCOUNT_TYPE,
    CASH_MARGIN,
    DB_PATH,
    ORDER_PASSWORD,
    ORDER_PRICE_BUFFER_PCT,
    ORDER_TIMEOUT_MIN,
)
from src.kabu_client import KabuClient

log = logging.getLogger(__name__)

EXCHANGE_CODE = 1


class OrderManager:
    def __init__(self, client: KabuClient, dry_run: bool = False) -> None:
        self._client = client
        self.dry_run = dry_run

    # ─── 買い注文 ──────────────────────────────────────────────────────────

    def place_buy_order(
        self,
        symbol: str,
        symbol_name: str,
        price: float,
        qty: int,
        exchange: int = 1,
        entry_path: str = "D",
        entry_signal: dict | None = None,
    ) -> str | None:
        # 急騰中の未約定を防ぐため発注価格にバッファを上乗せ
        order_price = round(price * (1 + ORDER_PRICE_BUFFER_PCT / 100)) if price > 0 else price
        ordered_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if self.dry_run:
            order_id = f"DRY-BUY-{symbol}-{datetime.now().strftime('%H%M%S')}"
            db.insert_order(
                order_id, symbol, symbol_name, "BUY", qty, order_price,
                "FILLED", ordered_at, dry_run=True, entry_path=entry_path,
                entry_signal=entry_signal,
            )
            db.insert_position(
                symbol, symbol_name, qty, order_price, order_id,
                dry_run=True, entry_path=entry_path, entry_signal=entry_signal,
            )
            log.info(
                "[DRY-RUN] 仮買い約定: %s %s %.0f円×%d株 (経路%s, バッファ後%.0f円)",
                order_id, symbol, price, qty, entry_path, order_price,
            )
            return order_id

        if not ORDER_PASSWORD:
            log.error("ORDER_PASSWORD が未設定です。")
            return None

        body = {
            "Password": ORDER_PASSWORD,
            "Symbol": symbol,
            "Exchange": exchange,
            "SecurityType": 1,          # 株式
            "Side": "2",                # 買い
            "CashMargin": CASH_MARGIN,
            "DelivType": 2,
            "AccountType": ACCOUNT_TYPE,
            "Qty": qty,
            "FrontOrderType": 20,       # 指値
            "Price": order_price,
            "ExpireDay": 0,             # 当日限り
        }
        try:
            resp = self._client.post("/sendorder", body)
        except Exception as e:
            log.error("買い注文失敗 %s: %s", symbol, e)
            return None

        order_id = resp.get("OrderId", "")
        if not order_id:
            log.error("買い注文: OrderId が返りませんでした。レスポンス: %s", resp)
            return None

        db.insert_order(
            order_id, symbol, symbol_name, "BUY", qty, order_price,
            "PENDING", ordered_at, dry_run=False, entry_path=entry_path,
            entry_signal=entry_signal,
        )
        log.info(
            "買い注文発注: %s %s %.0f円×%d株 (経路%s, バッファ後%.0f円)",
            order_id, symbol, price, qty, entry_path, order_price,
        )
        return order_id

    # ─── 売り注文 ──────────────────────────────────────────────────────────

    def place_sell_order(
        self,
        symbol: str,
        symbol_name: str,
        price: float,
        qty: int,
        exchange: int = 1,
    ) -> str | None:
        ordered_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if self.dry_run:
            order_id = f"DRY-SELL-{symbol}-{datetime.now().strftime('%H%M%S')}"
            db.insert_order(
                order_id, symbol, symbol_name, "SELL", qty, price,
                "FILLED", ordered_at, dry_run=True,
            )
            log.info("[DRY-RUN] 仮売り約定: %s %s %.0f円×%d株", order_id, symbol, price, qty)
            return order_id

        if not ORDER_PASSWORD:
            log.error("ORDER_PASSWORD が未設定です。")
            return None

        body = {
            "Password": ORDER_PASSWORD,
            "Symbol": symbol,
            "Exchange": exchange,
            "SecurityType": 1,
            "Side": "1",                # 売り
            "CashMargin": CASH_MARGIN,
            "DelivType": 2,
            "AccountType": ACCOUNT_TYPE,
            "Qty": qty,
            "FrontOrderType": 20,
            "Price": price,
            "ExpireDay": 0,
        }
        try:
            resp = self._client.post("/sendorder", body)
        except Exception as e:
            log.error("売り注文失敗 %s: %s", symbol, e)
            return None

        order_id = resp.get("OrderId", "")
        if not order_id:
            log.error("売り注文: OrderId が返りませんでした。レスポンス: %s", resp)
            return None

        db.insert_order(
            order_id, symbol, symbol_name, "SELL", qty, price,
            "PENDING", ordered_at, dry_run=False,
        )
        log.info("売り注文発注: %s %s %.0f円×%d株", order_id, symbol, price, qty)
        return order_id

    # ─── 注文取消 ──────────────────────────────────────────────────────────

    def cancel_order(self, order_id: str) -> bool:
        if self.dry_run:
            db.update_order_status(order_id, "CANCELLED")
            return True

        try:
            self._client.put("/cancelorder", {"OrderId": order_id, "Password": ORDER_PASSWORD})
            db.update_order_status(order_id, "CANCELLED")
            log.info("注文取消: %s", order_id)
            return True
        except Exception as e:
            log.error("注文取消失敗 %s: %s", order_id, e)
            return False

    # ─── PENDING 注文の確認 ───────────────────────────────────────────────

    def _get_current_price(self, symbol: str) -> float | None:
        """/board から現在値を取得する（売り再発注の指値算出用）。"""
        try:
            data = self._client.get(f"/board/{symbol}@{EXCHANGE_CODE}")
            price = data.get("CurrentPrice") or data.get("BestAsk1")
            return float(price) if price else None
        except Exception as e:
            log.warning("現在値取得失敗 %s: %s", symbol, e)
            return None

    def _finalize_sell_fill(self, order: dict, filled_qty: int, filled_price: float) -> dict | None:
        """CLOSING中ポジションへ約定分を積み上げ、確定していれば結果を返す。"""
        finalized = db.record_closing_fill(order["symbol"], self.dry_run, filled_qty, filled_price)
        if finalized is None:
            log.info(
                "売り一部約定: %s %d株 @ %.0f円（残数の約定確認を継続します）",
                order["symbol"], filled_qty, filled_price,
            )
        return finalized

    def check_pending_orders(self) -> list[dict]:
        """PENDING 注文を確認し、約定済みとタイムアウトを処理する。約定済みリストを返す。

        SELL注文が確定クローズに至った場合は close_price/pnl/pnl_pct/close_reason を
        エントリに含める（呼び出し側で notify_closed 相当の通知を出す判断材料にする）。
        """
        pending = db.get_pending_orders(dry_run=self.dry_run)
        filled_list: list[dict] = []

        if pending:
            try:
                api_orders = self._client.get("/orders", params={"product": 0})
                if not isinstance(api_orders, list):
                    api_orders = []
            except Exception as e:
                log.warning("注文一覧取得失敗: %s", e)
                api_orders = None

            if api_orders is not None:
                api_map = {o.get("ID", ""): o for o in api_orders}
                now = datetime.now()

                for order in pending:
                    oid = order["order_id"]
                    api_o = api_map.get(oid)

                    if api_o:
                        recv_qty = api_o.get("RecvQty", 0) or 0
                        qty = order["qty"]
                        if recv_qty >= qty:
                            # 全数約定
                            filled_price = api_o.get("Price", order["price"])
                            db.update_order_filled(oid, filled_price)
                            entry = {**order, "filled_price": filled_price}
                            if order["side"] == "BUY":
                                db.insert_position(
                                    order["symbol"], order["symbol_name"], qty,
                                    filled_price, oid, dry_run=self.dry_run,
                                    entry_path=order.get("entry_path", "D"),
                                    entry_signal={
                                        "score": order.get("entry_score"),
                                        "surge_score": order.get("entry_surge_score"),
                                        "surge_signal": order.get("entry_surge_signal"),
                                        "surge_confirm_count": order.get("entry_surge_confirm_count"),
                                        "reasons": order.get("entry_reasons"),
                                    },
                                )
                            else:
                                finalized = self._finalize_sell_fill(order, qty, filled_price)
                                if finalized:
                                    entry.update({
                                        "close_price":  finalized["close_price"],
                                        "pnl":          finalized["pnl"],
                                        "pnl_pct":      finalized["pnl_pct"],
                                        "close_reason": finalized["close_reason"],
                                    })
                            filled_list.append(entry)
                            log.info("約定確認: %s %s %.0f円", oid, order["symbol"], filled_price)
                            continue

                    # タイムアウトチェック
                    try:
                        ordered_dt = datetime.strptime(order["ordered_at"], "%Y-%m-%d %H:%M:%S")
                        elapsed = (now - ordered_dt).total_seconds() / 60
                    except Exception:
                        continue
                    if elapsed < ORDER_TIMEOUT_MIN:
                        continue

                    self.cancel_order(oid)
                    log.info("注文タイムアウト取消: %s (%d分経過)", oid, int(elapsed))

                    if order["side"] != "SELL":
                        continue

                    # 部分約定分があれば先に積み上げてから、残数を現在値で再発注する
                    recv_qty = (api_o.get("RecvQty", 0) or 0) if api_o else 0
                    if recv_qty > 0:
                        filled_price = api_o.get("Price", order["price"])
                        self._finalize_sell_fill(order, recv_qty, filled_price)
                    remaining = order["qty"] - recv_qty
                    if remaining <= 0:
                        continue
                    self._retry_sell(order["symbol"], order["symbol_name"], remaining)

        # CLOSING中だが対応するPENDING注文が無いポジション（前回の再発注失敗等）を救済する
        self._recover_orphaned_closing_positions()

        return filled_list

    def _retry_sell(self, symbol: str, symbol_name: str, qty: int) -> None:
        current = self._get_current_price(symbol)
        if current is None:
            log.warning("%s: 現在値取得失敗のため売り再発注を見送ります（次tickで再試行）", symbol)
            return
        new_order_id = self.place_sell_order(symbol, symbol_name, current, qty)
        if new_order_id:
            db.update_closing_order_id(symbol, new_order_id, dry_run=self.dry_run)
            log.info("売り注文再発注: %s %s %d株 @ %.0f円", new_order_id, symbol, qty, current)
        else:
            log.error("%s: 売り再発注に失敗しました。次tickで再試行します。", symbol)

    def _recover_orphaned_closing_positions(self) -> None:
        pending_ids = {o["order_id"] for o in db.get_pending_orders(dry_run=self.dry_run)}
        for pos in db.get_closing_positions(dry_run=self.dry_run):
            if pos.get("closing_order_id") in pending_ids:
                continue
            remaining = pos["qty"] - (pos.get("closing_filled_qty") or 0)
            if remaining <= 0:
                continue
            log.warning("%s: CLOSING中だがPENDING注文が見つかりません。再発注します。", pos["symbol"])
            self._retry_sell(pos["symbol"], pos.get("symbol_name") or "", remaining)
