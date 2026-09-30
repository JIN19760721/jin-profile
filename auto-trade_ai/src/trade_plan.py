"""
V2設計書 Phase1（Shadow Mode）: ENTRY候補ごとのSTOP/TARGET/RR算出。

観測専用。ここで計算される trade_plan / rr_verdict は記録されるだけで、
経路Dの実際の売買判定（risk_manager / entry_policy / entry_llm_check /
発注）には一切接続しない。売買結果を変えないことが絶対条件（P2/P6）。

STOP候補優先順位: 直近スイング安値 → VWAP → 前日高値 → ATR → 固定%フォールバック
TARGET候補優先順位: 直近スイング高値 → 当日/前日高値 → ATR → 最低RR逆算 → 固定%フォールバック
（「ブレイクライン」は現行のPRE_SURGE_SETUP＝価格未動パターンには概念的に馴染まないため
 Phase1では実装しない。Phase3でBREAKOUTパターンを導入する際に検討する。）

TARGET候補の最小距離チェックについて: PRE_SURGE_SETUP（価格未動）の性質上、
直近スイング高値・当日/前日高値は現在値のすぐ近くにあることが構造的に多く、
無条件で採用するとreward_per_shareが1〜2円程度しかない不当に低いRRを量産して
しまうことが実運用データ（2026-09時点、エントリーされた5件全てがRR<1.0）で
判明した。そのためこれらの候補は reward_per_share が entry_price の
RR_MIN_TARGET_REWARD_PCT% 未満の場合は採用せず、次の優先順位（ATR→最低RR逆算）
へフォールバックする。

STOP候補の最小距離チェックについて: 上記と鏡写しの問題として、直近スイング安値
等がエントリー価格のほぼ真上（risk_per_shareがごく小さい値）になるケースがあり、
この場合RRが数万〜数十万倍という無意味な値になることが実運用データ（2026-09末、
RR=884734等）で判明した。呼び値1枚分程度しか離れていないストップはノイズで
簡単に刈られる「見せかけの高RR」を生むため、risk_per_shareが entry_price の
RR_MIN_STOP_RISK_PCT% 未満の候補（ATR含む）は採用せず固定%フォールバックへ進む。

各値が取得できない場合は推測せず None を返す（P4: 取得不能は理由として報告する）。
"""

from __future__ import annotations

from dataclasses import dataclass

from src.config import (
    RR_MIN_RR_HARD,
    RR_MIN_RR_WATCH,
    RR_MIN_STOP_RISK_PCT,
    RR_MIN_TARGET_REWARD_PCT,
    RR_PREFERRED_RR,
    RR_STOP_ATR_MULT,
    RR_TARGET_ATR_MULT,
    STOP_LOSS_PCT_D,
    TAKE_PROFIT_PCT_D,
    STRATEGY_VERSION,
)


@dataclass
class TradePlan:
    entry_price: float
    stop_price: float | None
    stop_reason: str
    target_price: float | None
    target_reason: str
    risk_per_share: float | None
    reward_per_share: float | None
    risk_reward_ratio: float | None
    rr_verdict: str
    strategy_version: str = STRATEGY_VERSION


def _pick_stop(
    entry_price: float,
    swing_low: float | None,
    vwap: float | None,
    prev_day_high: float | None,
    atr: float | None,
) -> tuple[float, str]:
    min_risk = entry_price * RR_MIN_STOP_RISK_PCT / 100

    if swing_low is not None and 0 < swing_low < entry_price and entry_price - swing_low >= min_risk:
        return swing_low, "recent_swing_low"
    if vwap is not None and 0 < vwap < entry_price and entry_price - vwap >= min_risk:
        return vwap, "vwap"
    if prev_day_high is not None and 0 < prev_day_high < entry_price and entry_price - prev_day_high >= min_risk:
        return prev_day_high, "prev_day_high_broken"
    if atr is not None and atr > 0:
        candidate = entry_price - atr * RR_STOP_ATR_MULT
        if candidate > 0 and entry_price - candidate >= min_risk:
            return candidate, "atr"
    return entry_price * (1 + STOP_LOSS_PCT_D / 100), "fallback_pct"


def _pick_target(
    entry_price: float,
    swing_high: float | None,
    day_high: float | None,
    prev_day_high: float | None,
    atr: float | None,
    risk_per_share: float | None,
) -> tuple[float, str]:
    min_reward = entry_price * RR_MIN_TARGET_REWARD_PCT / 100

    if swing_high is not None and swing_high - entry_price >= min_reward:
        return swing_high, "recent_resistance"
    candidates = [
        v for v in (day_high, prev_day_high)
        if v is not None and v - entry_price >= min_reward
    ]
    if candidates:
        return min(candidates), "day_or_prev_high"
    if atr is not None and atr > 0:
        return entry_price + atr * RR_TARGET_ATR_MULT, "atr"
    if risk_per_share is not None and risk_per_share > 0:
        return entry_price + risk_per_share * RR_PREFERRED_RR, "min_rr"
    return entry_price * (1 + TAKE_PROFIT_PCT_D / 100), "fallback_pct"


def _rr_verdict(rr: float | None) -> str:
    if rr is None:
        return "UNKNOWN"
    if rr < RR_MIN_RR_HARD:
        return "NO_ENTRY"
    if rr < RR_MIN_RR_WATCH:
        return "NO_ENTRY_PRINCIPLE"
    if rr < 2.0:
        return "WATCH"
    return "HIGH"


def build_trade_plan(
    symbol: str,
    entry_price: float,
    *,
    vwap: float | None = None,
    day_high: float | None = None,
    swing_low: float | None = None,
    swing_high: float | None = None,
    prev_day_high: float | None = None,
    atr: float | None = None,
) -> TradePlan:
    """ENTRY候補1件分のtrade_plan（STOP/TARGET/RR）を計算する。観測専用。"""
    if entry_price <= 0:
        return TradePlan(
            entry_price=entry_price, stop_price=None, stop_reason="invalid_entry_price",
            target_price=None, target_reason="invalid_entry_price",
            risk_per_share=None, reward_per_share=None, risk_reward_ratio=None,
            rr_verdict="UNKNOWN",
        )

    stop_price, stop_reason = _pick_stop(entry_price, swing_low, vwap, prev_day_high, atr)
    risk_per_share = entry_price - stop_price
    if risk_per_share <= 0:
        # STOP候補がentry以上になってしまった（データ不整合）場合はフォールバックへ強制する
        stop_price = entry_price * (1 + STOP_LOSS_PCT_D / 100)
        stop_reason = "fallback_pct"
        risk_per_share = entry_price - stop_price

    target_price, target_reason = _pick_target(
        entry_price, swing_high, day_high, prev_day_high, atr, risk_per_share,
    )
    reward_per_share = target_price - entry_price
    if reward_per_share <= 0:
        target_price = entry_price * (1 + TAKE_PROFIT_PCT_D / 100)
        target_reason = "fallback_pct"
        reward_per_share = target_price - entry_price

    risk_reward_ratio = reward_per_share / risk_per_share if risk_per_share > 0 else None

    return TradePlan(
        entry_price=entry_price,
        stop_price=stop_price, stop_reason=stop_reason,
        target_price=target_price, target_reason=target_reason,
        risk_per_share=risk_per_share, reward_per_share=reward_per_share,
        risk_reward_ratio=risk_reward_ratio,
        rr_verdict=_rr_verdict(risk_reward_ratio),
    )
