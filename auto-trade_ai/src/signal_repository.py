"""
V2設計書 Phase0: シグナル状態遷移・候補追跡の記録リポジトリ。

観測専用モジュール。ここでの失敗・例外は一切、呼び出し元の売買判定
フローに影響を与えてはならない（P2 観測と売買を分離、P5 フォール
バック）。全ての公開関数は例外を握りつぶし、ログのみ出力する。
"""

from __future__ import annotations

import logging
from datetime import datetime

from src import db
from src.config import STOP_LOSS_PCT_D, TAKE_PROFIT_PCT_D

log = logging.getLogger(__name__)

_STRATEGY_VERSION = "v1_pathd"
_TRACK_CHECKPOINTS_MIN = (5, 10, 15, 30)


def record_signal_transition(
    symbol: str,
    price: float | None,
    current_signal: str,
    surge_score: float | None = None,
    surge_reason: str | None = None,
    vwap_position: float | None = None,
    volume_spike_ratio: float | None = None,
    turnover_spike_ratio: float | None = None,
    near_day_high_ratio: float | None = None,
) -> None:
    """surge_signalの状態遷移を記録する。直前と同一状態なら何もしない（重複防止）。"""
    try:
        last = db.get_last_signal(symbol)
        previous_signal = last["current_signal"] if last else None
        if previous_signal == current_signal:
            return
        db.insert_signal_history({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "symbol": symbol,
            "price": price,
            "previous_signal": previous_signal,
            "current_signal": current_signal,
            "surge_score": surge_score,
            "surge_state": current_signal,
            "surge_reason": surge_reason,
            "vwap": vwap_position,
            "volume_spike_ratio": volume_spike_ratio,
            "turnover_spike_ratio": turnover_spike_ratio,
            "near_day_high_ratio": near_day_high_ratio,
            "one_hour_trend": None,
            "claude_result": None,
            "claude_reason": None,
            "entry_allowed": None,
            "no_entry_reason": None,
            "strategy_version": _STRATEGY_VERSION,
        })
    except Exception as e:
        log.warning("signal_history記録失敗（無視して継続） %s: %s", symbol, e)


def record_entry_decision(
    symbol: str,
    price: float | None,
    surge_score: float | None,
    one_hour_trend: str | None,
    claude_result: str | None,
    claude_reason: str | None,
    entry_allowed: bool,
    no_entry_reason: str | None,
) -> None:
    """エントリー判断（risk/policy/Claude確認を経た結果）を記録する。毎回1件追加（重複防止なし）。"""
    try:
        last = db.get_last_signal(symbol)
        previous_signal = last["current_signal"] if last else None
        current_signal = "ENTRY" if entry_allowed else "NO_ENTRY"
        db.insert_signal_history({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "symbol": symbol,
            "price": price,
            "previous_signal": previous_signal,
            "current_signal": current_signal,
            "surge_score": surge_score,
            "surge_state": previous_signal,
            "surge_reason": None,
            "vwap": None,
            "volume_spike_ratio": None,
            "turnover_spike_ratio": None,
            "near_day_high_ratio": None,
            "one_hour_trend": one_hour_trend,
            "claude_result": claude_result,
            "claude_reason": claude_reason,
            "entry_allowed": int(entry_allowed),
            "no_entry_reason": no_entry_reason,
            "strategy_version": _STRATEGY_VERSION,
        })
    except Exception as e:
        log.warning("signal_history（エントリー判断）記録失敗（無視して継続） %s: %s", symbol, e)


def record_candidate(
    symbol: str,
    signal_price: float,
    signal_type: str,
    entered: bool,
    no_entry_reason: str | None,
) -> str | None:
    """PRE_SURGE_SETUP等の候補発生を candidate_outcomes に記録する（見送りも含む）。

    戻り値: candidate_id。記録失敗時は None。
    """
    try:
        now = datetime.now()
        candidate_id = f"{symbol}_{now.strftime('%Y%m%d%H%M%S%f')}"
        db.insert_candidate_outcome({
            "candidate_id": candidate_id,
            "symbol": symbol,
            "signal_time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "signal_price": signal_price,
            "signal_type": signal_type,
            "entered": int(entered),
            "no_entry_reason": no_entry_reason,
            "max_price": signal_price,
            "min_price": signal_price,
            "strategy_version": _STRATEGY_VERSION,
        })
        return candidate_id
    except Exception as e:
        log.warning("candidate_outcomes記録失敗（無視して継続） %s: %s", symbol, e)
        return None


def update_candidate_prices(symbol: str, current_price: float) -> None:
    """指定銘柄の追跡中candidate_outcomesを、最新値で更新する。

    _evaluate_surge_scores が毎tick取得しているboard価格に相乗りする想定
    （追加のAPI呼び出しは発生させない）。5/10/15/30分の到達点で該当列を
    埋め、30分経過したら追跡完了とする。
    """
    try:
        pending = [p for p in db.get_pending_candidate_outcomes() if p["symbol"] == symbol]
    except Exception as e:
        log.warning("candidate_outcomes取得失敗（無視して継続） %s: %s", symbol, e)
        return

    if not pending:
        return

    now = datetime.now()
    for row in pending:
        try:
            _update_one_candidate(row, current_price, now)
        except Exception as e:
            log.warning("candidate_outcomes更新失敗（無視して継続） %s: %s", row.get("candidate_id"), e)


def _update_one_candidate(row: dict, current_price: float, now: datetime) -> None:
    signal_time = datetime.strptime(row["signal_time"], "%Y-%m-%d %H:%M:%S")
    elapsed_min = (now - signal_time).total_seconds() / 60
    signal_price = row["signal_price"]

    max_price = max(row["max_price"] or signal_price, current_price)
    min_price = min(row["min_price"] or signal_price, current_price)
    pnl_pct = (current_price - signal_price) / signal_price * 100

    fields: dict = {"max_price": max_price, "min_price": min_price}

    for minutes in _TRACK_CHECKPOINTS_MIN:
        col = f"price_after_{minutes}m"
        if row.get(col) is None and elapsed_min >= minutes:
            fields[col] = current_price

    # 固定-2%/+5%（経路Dの実際の閾値）の先着判定
    if row.get("first_touch") is None:
        if pnl_pct <= STOP_LOSS_PCT_D:
            fields["first_touch"] = "STOP"
        elif pnl_pct >= TAKE_PROFIT_PCT_D:
            fields["first_touch"] = "TARGET"

    if elapsed_min >= max(_TRACK_CHECKPOINTS_MIN):
        max_upside_pct = (max_price - signal_price) / signal_price * 100
        max_downside_pct = (min_price - signal_price) / signal_price * 100
        fields["max_upside_pct"] = max_upside_pct
        fields["max_downside_pct"] = max_downside_pct
        fields["mfe_pct"] = max_upside_pct
        fields["mae_pct"] = max_downside_pct
        if row.get("first_touch") is None:
            fields["first_touch"] = "NEITHER"
        fields["tracking_done"] = 1

    db.update_candidate_outcome(row["candidate_id"], fields)
