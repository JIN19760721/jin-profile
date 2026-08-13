"""
急騰予兆スコア (surge_score) 計算モジュール。

score (ランキング由来) とは独立したリアルタイム指標。
100点満点で「いま急騰が始まろうとしているか」を評価する。

配点:
  A. 売買代金急増  25点  turnover_spike_ratio
  B. 出来高急増    20点  volume_spike_ratio
  C. 価格加速      20点  price_change_1m/3m/5m
  D. 高値接近/更新 15点  near_day_high_ratio
  E. VWAP位置      10点  vwap_position (0=VWAP下, 1=VWAP上, 2=VWAP+0.5%上)
  F. スコア加速度  10点  surge_score_delta

合計 100点

surge_signal:
  SURGE_STRONG     >= 85
  SURGE_CANDIDATE  >= 70
  SURGE_WATCH      >= 50
  SURGE_FADE       ← 前回比 -15 以上低下
  NO_SURGE         < 50 または除外条件

除外条件（強制 NO_SURGE）:
  - 5分騰落が +10%以上（急騰後の飛び乗り防止）
  - 出来高急増なし かつ 売買代金急増なし（出来高フィルター）

VWAP 下での減点:
  - 現在値 < VWAP → surge_score から -10
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time

_MARKET_OPEN = time(9, 0)
_LUNCH_START = time(11, 30)
_LUNCH_END   = time(12, 30)
_TOTAL_TRADING_MINUTES = 330.0  # 前場150 + 後場180
_MIN_NORM_MINUTES = 30.0  # 寄り付き直後の出来高過大正規化を防ぐ下限


def _elapsed_trading_minutes() -> float:
    """市場開始からの経過取引分数（昼休みを除く）。"""
    now = datetime.now().time()
    if now < _MARKET_OPEN:
        return 0.0
    if now <= _LUNCH_START:
        d = datetime.today()
        from datetime import datetime as _dt
        return (_dt.combine(d, now) - _dt.combine(d, _MARKET_OPEN)).total_seconds() / 60
    if now < _LUNCH_END:
        return 150.0
    if now <= time(15, 30):
        d = datetime.today()
        from datetime import datetime as _dt
        return 150.0 + (_dt.combine(d, now) - _dt.combine(d, _LUNCH_END)).total_seconds() / 60
    return _TOTAL_TRADING_MINUTES


@dataclass
class SurgeResult:
    """calculate_surge_score の戻り値。"""
    symbol:               str
    surge_score:          float
    surge_signal:         str
    surge_reason:         str
    surge_score_delta:    float          # 前回との差分 (None → 0)
    volume_spike_ratio:   float          # 今日の出来高ペース ÷ 20日平均
    turnover_spike_ratio: float          # 今日の売買代金ペース ÷ 20日平均
    price_change_1m:      float          # 1分価格変化率 (%)
    price_change_3m:      float          # 3分価格変化率 (%)
    price_change_5m:      float          # 5分価格変化率 (%)
    near_day_high_ratio:  float          # 現在値 / 当日高値
    vwap_position:        float          # (現在値 - VWAP) / VWAP * 100 (%)
    # 各項目得点（デバッグ用）
    score_a:              float = 0.0
    score_b:              float = 0.0
    score_c:              float = 0.0
    score_d:              float = 0.0
    score_e:              float = 0.0
    score_f:              float = 0.0


# ── 各項目スコア計算 ───────────────────────────────────────────────────────

def _score_turnover_spike(ratio: float) -> float:
    """A. 売買代金急増 (25点)"""
    if ratio >= 5.0: return 25.0
    if ratio >= 3.0: return 18.0
    if ratio >= 2.0: return 10.0
    return 0.0


def _score_volume_spike(ratio: float) -> float:
    """B. 出来高急増 (20点)"""
    if ratio >= 5.0: return 20.0
    if ratio >= 3.0: return 14.0
    if ratio >= 2.0: return  8.0
    return 0.0


def _score_price_accel(pc1: float, pc3: float, pc5: float) -> tuple[float, bool]:
    """C. 価格加速 (20点)。(得点, 飛び乗りリスクフラグ) を返す。"""
    score = 0.0
    if pc1 >= 0.5:  score += 5.0
    if pc3 >= 1.0:  score += 7.0
    if pc5 >= 2.0:  score += 8.0
    if pc5 >= 8.0:  score -= 10.0  # 急騰後飛び乗り減点
    overheat = pc5 >= 10.0         # 強制 NO_SURGE フラグ
    return score, overheat


def _score_day_high(ratio: float) -> float:
    """D. 高値接近/更新 (15点)。ratio = 現在値 / 当日高値"""
    if ratio >= 1.0:   return 15.0  # 高値更新
    if ratio >= 0.99:  return  8.0
    if ratio >= 0.98:  return  5.0
    return 0.0


def _score_vwap(vwap_pos_pct: float) -> float:
    """E. VWAP位置 (10点)。vwap_pos_pct = (現在値 - VWAP) / VWAP × 100"""
    if vwap_pos_pct >= 0.5: return 10.0
    if vwap_pos_pct >= 0.0: return  5.0
    return 0.0


def _score_delta(delta: float) -> float:
    """F. スコア加速度 (10点)。前回 surge_score との差。"""
    if delta >= 10.0: return 10.0
    if delta >=  5.0: return  5.0
    return 0.0


# ── メイン計算関数 ─────────────────────────────────────────────────────────

def calculate_surge_score(
    symbol: str,
    current_price: float,
    day_high: float,
    today_volume: float,
    today_turnover: float,
    vwap: float | None,
    closes_1m: list[float],
    avg_volume_20d: float,
    avg_turnover_20d: float,
    previous_surge_score: float | None = None,
    elapsed_minutes: float | None = None,
) -> SurgeResult:
    """
    急騰予兆スコアを計算して SurgeResult を返す。

    Parameters
    ----------
    symbol          : 銘柄コード
    current_price   : 現在値
    day_high        : 当日高値
    today_volume    : 本日の累積出来高（株数）
    today_turnover  : 本日の累積売買代金（円）
    vwap            : VWAP（None の場合は E 項目を 0 点）
    closes_1m       : 直近 1 分足終値リスト（古い順）、最低 6 本必要
    avg_volume_20d  : 20 日平均出来高 / 日（株数）
    avg_turnover_20d: 20 日平均売買代金 / 日（円）
    previous_surge_score: 前回の surge_score（None = 初回）
    elapsed_minutes : 取引時間経過分（None = 自動計算）
    """
    if elapsed_minutes is None:
        elapsed_minutes = _elapsed_trading_minutes()

    # ── 急増率の計算（経過時間で正規化） ─────────────────────────────────
    time_ratio = max(elapsed_minutes / _TOTAL_TRADING_MINUTES, _MIN_NORM_MINUTES / _TOTAL_TRADING_MINUTES)

    if avg_volume_20d > 0:
        projected_volume   = today_volume / time_ratio
        volume_spike_ratio = projected_volume / avg_volume_20d
    else:
        volume_spike_ratio = 0.0

    if avg_turnover_20d > 0:
        projected_turnover   = today_turnover / time_ratio
        turnover_spike_ratio = projected_turnover / avg_turnover_20d
    else:
        turnover_spike_ratio = 0.0

    # ── 価格変化率（1m / 3m / 5m） ────────────────────────────────────────
    closes = closes_1m  # 古い順 (oldest → newest)
    n = len(closes)
    cur = current_price if current_price > 0 else (closes[-1] if n >= 1 else 0.0)

    def _pct(bars_ago: int) -> float:
        idx = n - 1 - bars_ago
        if idx < 0 or closes[idx] <= 0:
            return 0.0
        return (cur - closes[idx]) / closes[idx] * 100

    price_change_1m = _pct(1)
    price_change_3m = _pct(3)
    price_change_5m = _pct(5)

    # ── 当日高値比 ─────────────────────────────────────────────────────────
    near_day_high_ratio = (cur / day_high) if day_high > 0 else 0.0

    # ── VWAP 位置 ──────────────────────────────────────────────────────────
    if vwap and vwap > 0 and cur > 0:
        vwap_position = (cur - vwap) / vwap * 100
    else:
        vwap_position = 0.0

    # ── delta ──────────────────────────────────────────────────────────────
    surge_score_delta = 0.0  # 後で上書き

    # ── 各項目スコア ───────────────────────────────────────────────────────
    score_a = _score_turnover_spike(turnover_spike_ratio)
    score_b = _score_volume_spike(volume_spike_ratio)
    score_c, overheat_flag = _score_price_accel(price_change_1m, price_change_3m, price_change_5m)
    score_d = _score_day_high(near_day_high_ratio)
    score_e = _score_vwap(vwap_position) if (vwap and vwap > 0) else 0.0
    # score_f は後で計算

    # ── VWAP 下 → -10 点 ──────────────────────────────────────────────────
    vwap_penalty = -10.0 if (vwap and vwap > 0 and cur < vwap) else 0.0

    # ── 仮スコア（F 抜き）────────────────────────────────────────────────
    base_score = score_a + score_b + score_c + score_d + score_e + vwap_penalty

    # ── F. スコア加速度 ──────────────────────────────────────────────────
    if previous_surge_score is not None:
        surge_score_delta = base_score - previous_surge_score
    score_f = _score_delta(surge_score_delta)

    raw_score = base_score + score_f
    surge_score = round(min(max(raw_score, 0.0), 100.0), 1)

    # ── 強制 NO_SURGE 条件 ───────────────────────────────────────────────
    no_volume = (volume_spike_ratio < 2.0 and turnover_spike_ratio < 2.0)

    # PRE_SURGE_SETUP 判定: 出来高急増しているが価格変化はまだ小さい（蓄積フェーズ）
    # 急騰後に飛び乗る「後追いエントリー」を避け、上がる前に入るための条件
    pre_surge_setup = (
        not overheat_flag
        and not no_volume
        and price_change_5m < 2.0      # 5分間でまだ動いていない
        and abs(price_change_1m) < 0.5  # 直前1分は横ばい（加速していない）
        and (vwap is None or vwap <= 0 or vwap_position >= 0.0)  # VWAP以上（買い蓄積の証左）
    )

    # SURGE_FADE は飛び乗り防止より優先（急落通知として有用）
    if previous_surge_score is not None and surge_score_delta <= -15.0:
        surge_signal = "SURGE_FADE"
        surge_reason = f"surge_score 急落 ({previous_surge_score:.0f} → {surge_score:.0f})"
    elif overheat_flag:
        surge_signal = "NO_SURGE"
        surge_reason = "5分騰落+10%超 → 飛び乗り防止"
    elif no_volume:
        surge_signal = "NO_SURGE"
        surge_reason = "出来高・売買代金ともに急増なし"
    elif pre_surge_setup:
        surge_signal = "PRE_SURGE_SETUP"
    elif surge_score >= 85.0:
        surge_signal = "SURGE_STRONG"
    elif surge_score >= 70.0:
        surge_signal = "SURGE_CANDIDATE"
    elif surge_score >= 50.0:
        surge_signal = "SURGE_WATCH"
    else:
        surge_signal = "NO_SURGE"
        surge_reason = f"スコア不足 ({surge_score:.0f})"

    # surge_reason を構築（NO_SURGE 以外）
    if surge_signal == "PRE_SURGE_SETUP":
        parts = []
        if turnover_spike_ratio >= 2.0:
            parts.append(f"売買代金{turnover_spike_ratio:.1f}倍")
        if volume_spike_ratio >= 2.0:
            parts.append(f"出来高{volume_spike_ratio:.1f}倍")
        parts.append(f"価格{price_change_5m:+.1f}%(5分)")
        if vwap and vwap > 0 and vwap_position >= 0.0:
            parts.append("VWAP上")
        surge_reason = "出来高先行/価格未動 — " + " / ".join(parts)
    if surge_signal not in ("NO_SURGE", "SURGE_FADE", "PRE_SURGE_SETUP"):
        parts: list[str] = []
        if turnover_spike_ratio >= 2.0:
            parts.append(f"売買代金{turnover_spike_ratio:.1f}倍急増")
        if volume_spike_ratio >= 2.0:
            parts.append(f"出来高{volume_spike_ratio:.1f}倍急増")
        if price_change_5m >= 2.0:
            parts.append(f"5分+{price_change_5m:.1f}%加速")
        elif price_change_3m >= 1.0:
            parts.append(f"3分+{price_change_3m:.1f}%加速")
        if near_day_high_ratio >= 0.99:
            parts.append("高値圏接近")
        if vwap and vwap > 0 and vwap_position >= 0.5:
            parts.append("VWAP上")
        if surge_score_delta >= 5.0:
            parts.append(f"スコア加速(+{surge_score_delta:.0f})")
        surge_reason = " / ".join(parts) if parts else surge_signal

    return SurgeResult(
        symbol=symbol,
        surge_score=surge_score,
        surge_signal=surge_signal,
        surge_reason=surge_reason,
        surge_score_delta=round(surge_score_delta, 1),
        volume_spike_ratio=round(volume_spike_ratio, 3),
        turnover_spike_ratio=round(turnover_spike_ratio, 3),
        price_change_1m=round(price_change_1m, 2),
        price_change_3m=round(price_change_3m, 2),
        price_change_5m=round(price_change_5m, 2),
        near_day_high_ratio=round(near_day_high_ratio, 4),
        vwap_position=round(vwap_position, 2),
        score_a=score_a,
        score_b=score_b,
        score_c=score_c,
        score_d=score_d,
        score_e=score_e,
        score_f=score_f,
    )
