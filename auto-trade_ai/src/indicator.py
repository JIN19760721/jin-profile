"""
WebSocket メッセージから 8 指標を計算する。

指標一覧:
  1. 板買い優勢度        buy_dominance      TotalBidQty / (Bid+Ask) %
  2. 板インバランス      imbalance          (Bid-Ask) / (Bid+Ask)  -1〜+1
  3. 予想価格            expected_price     最良気配の加重中値
  4. 予想値上がり率      expected_change_pct (予想価格 - 前日終値) / 前日終値 %
  5. 出来高急増率        volume_surge_rate  本日ペース ÷ 基準出来高 (倍)
  6. 予想売買代金        expected_turnover  本日ペースから算出した終値時点予測 (億円)
  7. 価格上下回数        fluctuation_count  WebSocket 受信ごとに価格変化を累積
  8. VWAP乖離率          vwap_deviation     (現在値 - VWAP) / VWAP %
"""

from dataclasses import dataclass, field
from datetime import datetime, time


# 取引時間定数
_MARKET_OPEN  = time(9,  0)
_LUNCH_START  = time(11, 30)
_LUNCH_END    = time(12, 30)
_MARKET_CLOSE = time(15, 30)
_TOTAL_TRADING_MINUTES = 330.0  # 前場 150 + 後場 180


def elapsed_trading_minutes() -> float:
    """市場開始からの経過取引分数（昼休みを除く）を返す。"""
    now = datetime.now().time()
    if now < _MARKET_OPEN:
        return 0.0
    if now <= _LUNCH_START:
        return _minutes_between(_MARKET_OPEN, now)
    if now < _LUNCH_END:
        return 150.0
    if now <= _MARKET_CLOSE:
        return 150.0 + _minutes_between(_LUNCH_END, now)
    return _TOTAL_TRADING_MINUTES


def _minutes_between(t1: time, t2: time) -> float:
    d = datetime.today()
    dt1 = datetime.combine(d, t1)
    dt2 = datetime.combine(d, t2)
    return max((dt2 - dt1).total_seconds() / 60, 0.0)


@dataclass
class SymbolState:
    symbol:      str
    symbol_name: str = ""

    # WebSocket から更新される生データ
    current_price:  float = 0.0
    prev_close:     float = 0.0
    total_bid_qty:  float = 0.0
    total_ask_qty:  float = 0.0
    bid_price1:     float = 0.0
    ask_price1:     float = 0.0
    bid_qty1:       float = 0.0
    ask_qty1:       float = 0.0
    trading_volume: float = 0.0
    turnover:       float = 0.0
    vwap:           float = 0.0

    # 価格変化カウント用
    _prev_price: float = field(default=0.0, repr=False)
    up_count:   int = 0
    down_count: int = 0

    # 計算済み指標
    buy_dominance:       float = 0.0
    imbalance:           float = 0.0
    expected_price:      float = 0.0
    expected_change_pct: float = 0.0
    volume_surge_rate:   float = 0.0
    expected_turnover:   float = 0.0  # 億円
    fluctuation_count:   int   = 0
    vwap_deviation:      float = 0.0

    entry_score: float = 0.0
    signal:      str   = "NO_ENTRY"
    last_updated: str  = ""
    update_count: int  = 0


def update_state(state: SymbolState, msg: dict, baseline_daily_volume: int) -> None:
    """WebSocket メッセージで SymbolState を更新し、8 指標を再計算する。"""
    # ── 生データ更新 ─────────────────────────────────────────────────────────
    price = float(msg.get("CurrentPrice") or msg.get("CalcPrice") or state.current_price or 0)
    state.current_price  = price
    state.prev_close     = float(msg.get("PreviousClose")  or state.prev_close or 0)
    state.total_bid_qty  = float(msg.get("TotalBidQty")    or state.total_bid_qty or 0)
    state.total_ask_qty  = float(msg.get("TotalAskQty")    or state.total_ask_qty or 0)
    state.bid_price1     = float(msg.get("BidPrice1") or msg.get("BidPrice") or state.bid_price1 or 0)
    state.ask_price1     = float(msg.get("AskPrice1") or msg.get("AskPrice") or state.ask_price1 or 0)
    state.bid_qty1       = float(msg.get("BidQty1")   or msg.get("BidQty")   or state.bid_qty1 or 0)
    state.ask_qty1       = float(msg.get("AskQty1")   or msg.get("AskQty")   or state.ask_qty1 or 0)
    state.trading_volume = float(msg.get("Volume") or msg.get("TradingVolume") or state.trading_volume or 0)
    state.turnover       = float(msg.get("TurnoverValue") or state.turnover or 0)
    state.vwap           = float(msg.get("VWAP") or state.vwap or 0)
    state.symbol_name    = msg.get("SymbolName") or state.symbol_name
    state.last_updated   = datetime.now().strftime("%H:%M:%S")
    state.update_count  += 1

    # ── 価格上下回数 ──────────────────────────────────────────────────────────
    if state._prev_price > 0 and price > 0:
        if price > state._prev_price:
            state.up_count += 1
        elif price < state._prev_price:
            state.down_count += 1
    state._prev_price     = price
    state.fluctuation_count = state.up_count + state.down_count

    # ── 指標計算 ──────────────────────────────────────────────────────────────
    total_qty = state.total_bid_qty + state.total_ask_qty

    # ① 板買い優勢度
    state.buy_dominance = (
        state.total_bid_qty / total_qty * 100 if total_qty > 0 else 0.0
    )

    # ② 板インバランス
    state.imbalance = (
        (state.total_bid_qty - state.total_ask_qty) / total_qty if total_qty > 0 else 0.0
    )

    # ③ 予想価格（最良気配の出来高加重中値）
    denom = state.bid_qty1 + state.ask_qty1
    if denom > 0 and state.bid_price1 > 0 and state.ask_price1 > 0:
        state.expected_price = (
            state.bid_price1 * state.ask_qty1 + state.ask_price1 * state.bid_qty1
        ) / denom
    elif state.bid_price1 > 0 and state.ask_price1 > 0:
        state.expected_price = (state.bid_price1 + state.ask_price1) / 2
    else:
        state.expected_price = price

    # ④ 予想値上がり率
    if state.prev_close > 0:
        state.expected_change_pct = (
            (state.expected_price - state.prev_close) / state.prev_close * 100
        )

    # ⑤ 出来高急増率（本日ペースを終値まで外挿して基準値と比較）
    elapsed = elapsed_trading_minutes()
    if elapsed > 0 and baseline_daily_volume > 0:
        projected = state.trading_volume / (elapsed / _TOTAL_TRADING_MINUTES)
        state.volume_surge_rate = projected / baseline_daily_volume
    else:
        state.volume_surge_rate = 0.0

    # ⑥ 予想売買代金（億円）
    if elapsed > 0:
        state.expected_turnover = (
            state.turnover / (elapsed / _TOTAL_TRADING_MINUTES) / 1_0000_0000
        )

    # ⑦ 価格上下回数 — 上記で更新済み

    # ⑧ VWAP 乖離率
    if state.vwap > 0:
        state.vwap_deviation = (price - state.vwap) / state.vwap * 100
