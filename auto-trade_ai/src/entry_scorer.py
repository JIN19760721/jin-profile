"""
ENTRY_SCORE (100点満点) の計算とシグナル判定。

配点:
  板買い優勢度    25点  buy_dominance
  板インバランス  20点  imbalance
  予想値上がり率  20点  expected_change_pct
  出来高急増率    15点  volume_surge_rate
  VWAP乖離率      15点  vwap_deviation
  価格上下回数     5点  fluctuation_count
  ─────────────────────
  合計           100点

シグナル:
  ENTRY        >= 85点
  WATCH_STRONG >= 70点
  WATCH        >= 55点
  NO_ENTRY      < 55点
"""

from src.config import (
    BASELINE_DAILY_VOLUME,
    SCORE_BUY_DOMINANCE,
    SCORE_EXPECTED_CHANGE,
    SCORE_FLUCTUATION,
    SCORE_IMBALANCE,
    SCORE_VOLUME_SURGE,
    SCORE_VWAP_DEVIATION,
    SIGNAL_ENTRY,
    SIGNAL_WATCH,
    SIGNAL_WATCH_STRONG,
)
from src.indicator import SymbolState


def _score_buy_dominance(v: float, max_pt: int) -> float:
    """板買い優勢度 (%) → スコア"""
    if v >= 70:  return max_pt
    if v >= 60:  return max_pt * 0.72
    if v >= 55:  return max_pt * 0.48
    if v >= 50:  return max_pt * 0.24
    return 0.0


def _score_imbalance(v: float, max_pt: int) -> float:
    """板インバランス (-1〜+1) → スコア"""
    if v >= 0.5:  return max_pt
    if v >= 0.3:  return max_pt * 0.75
    if v >= 0.1:  return max_pt * 0.40
    if v >= 0.0:  return max_pt * 0.15
    return 0.0


def _score_expected_change(v: float, max_pt: int) -> float:
    """予想値上がり率 (%) → スコア"""
    if v >= 3.0:  return max_pt
    if v >= 2.0:  return max_pt * 0.75
    if v >= 1.0:  return max_pt * 0.50
    if v >= 0.5:  return max_pt * 0.25
    return 0.0


def _score_volume_surge(v: float, max_pt: int) -> float:
    """出来高急増率 (倍) → スコア"""
    if v >= 3.0:  return max_pt
    if v >= 2.0:  return max_pt * 0.67
    if v >= 1.5:  return max_pt * 0.40
    if v >= 1.0:  return max_pt * 0.20
    return 0.0


def _score_vwap_deviation(v: float, max_pt: int) -> float:
    """VWAP乖離率 (%) → スコア（上方乖離が適度なほど高得点）"""
    if 0.0 <= v < 2.0:  return max_pt        # 適度な上方乖離
    if 2.0 <= v < 4.0:  return max_pt * 0.53  # やや過熱
    if -1.0 <= v < 0.0: return max_pt * 0.33  # VWAP 直下
    return 0.0                                 # 過熱 or 大幅下落


def _score_fluctuation(v: int, max_pt: int) -> float:
    """価格上下回数 → スコア（活発な売買＝高得点）"""
    if v >= 20: return max_pt
    if v >= 10: return max_pt * 0.60
    if v >=  5: return max_pt * 0.20
    return 0.0


def calculate_entry_score(state: SymbolState) -> tuple[float, str]:
    """
    ENTRY_SCORE と シグナルを返す。

    Returns
    -------
    (score, signal)
      score  : 0.0〜100.0
      signal : "ENTRY" | "WATCH_STRONG" | "WATCH" | "NO_ENTRY"
    """
    score = (
        _score_buy_dominance(state.buy_dominance,       SCORE_BUY_DOMINANCE)
        + _score_imbalance(state.imbalance,             SCORE_IMBALANCE)
        + _score_expected_change(state.expected_change_pct, SCORE_EXPECTED_CHANGE)
        + _score_volume_surge(state.volume_surge_rate,  SCORE_VOLUME_SURGE)
        + _score_vwap_deviation(state.vwap_deviation,   SCORE_VWAP_DEVIATION)
        + _score_fluctuation(state.fluctuation_count,   SCORE_FLUCTUATION)
    )
    score = round(min(score, 100.0), 1)

    if score >= SIGNAL_ENTRY:
        signal = "ENTRY"
    elif score >= SIGNAL_WATCH_STRONG:
        signal = "WATCH_STRONG"
    elif score >= SIGNAL_WATCH:
        signal = "WATCH"
    else:
        signal = "NO_ENTRY"

    return score, signal
