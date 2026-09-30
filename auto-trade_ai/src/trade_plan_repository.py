"""
V2設計書 Phase1（Shadow Mode）: trade_plan（STOP/TARGET/RR）の記録リポジトリ。

観測専用モジュール。src/signal_repository.py と同じ契約:
ここでの失敗・例外は一切、呼び出し元の売買判定フローに影響を与えては
ならない（P2 観測と売買を分離、P5 フォールバック）。公開関数は例外を
握りつぶし、ログのみ出力する。
"""

from __future__ import annotations

import logging
from datetime import datetime

from src import db
from src.trade_plan import TradePlan

log = logging.getLogger(__name__)


def record_trade_plan(candidate_id: str, symbol: str, plan: TradePlan) -> None:
    """候補1件分のtrade_planをtrade_plansテーブルへ記録する（観測専用、1候補につき1回）。"""
    try:
        db.insert_trade_plan({
            "candidate_id": candidate_id,
            "symbol": symbol,
            "signal_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "entry_price": plan.entry_price,
            "stop_price": plan.stop_price,
            "stop_reason": plan.stop_reason,
            "target_price": plan.target_price,
            "target_reason": plan.target_reason,
            "risk_per_share": plan.risk_per_share,
            "reward_per_share": plan.reward_per_share,
            "risk_reward_ratio": plan.risk_reward_ratio,
            "rr_verdict": plan.rr_verdict,
            "strategy_version": plan.strategy_version,
        })
    except Exception as e:
        log.warning("trade_plans記録失敗（無視して継続） %s: %s", symbol, e)
