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
        entry_path: str = "A",
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

    def check_pending_orders(self) -> list[dict]:
        """PENDING 注文を確認し、約定済みとタイムアウトを処理する。約定済みリストを返す。"""
        pending = db.get_pending_orders(dry_run=self.dry_run)
        filled_list: list[dict] = []

        if not pending:
            return filled_list

        try:
            api_orders = self._client.get("/orders", params={"product": 0})
            if not isinstance(api_orders, list):
                api_orders = []
        except Exception as e:
            log.warning("注文一覧取得失敗: %s", e)
            return filled_list

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
                    if order["side"] == "BUY":
                        db.insert_position(
                            order["symbol"], order["symbol_name"], qty,
                            filled_price, oid, dry_run=self.dry_run,
                            entry_path=order.get("entry_path", "A"),
                            entry_signal={
                                "score": order.get("entry_score"),
                                "surge_score": order.get("entry_surge_score"),
                                "surge_signal": order.get("entry_surge_signal"),
                                "surge_confirm_count": order.get("entry_surge_confirm_count"),
                                "reasons": order.get("entry_reasons"),
                            },
                        )
                    filled_list.append({**order, "filled_price": filled_price})
                    log.info("約定確認: %s %s %.0f円", oid, order["symbol"], filled_price)
                    continue

            # タイムアウトチェック
            try:
                ordered_dt = datetime.strptime(order["ordered_at"], "%Y-%m-%d %H:%M:%S")
                elapsed = (now - ordered_dt).total_seconds() / 60
                if elapsed >= ORDER_TIMEOUT_MIN:
                    self.cancel_order(oid)
                    log.info("注文タイムアウト取消: %s (%d分経過)", oid, int(elapsed))
            except Exception:
                pass

        return filled_list
