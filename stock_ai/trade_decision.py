"""
損益率・VWAP・前日高値安値・寄り付き30分レンジを使ったデイトレ判定。

判定シグナル: WATCH_STRONG / STOP_LOSS / TAKE_PROFIT / WATCH / STAY（優先順位もこの順）

急騰急落フィルター:
  5分足1本の急変（bar_change_pct）や出来高異常（abnormal_volume_flag）が
  あれば、損益や前日安値割れ・寄り付き安値割れが即 STOP_LOSS / TAKE_PROFIT
  になる前に WATCH_STRONG として強い警戒を出す（売買確定ではない）。

2本連続確認:
  STOP_LOSS（損益率 / VWAP割れ / 前日安値割れ / 寄り付き30分安値割れ）/
  TAKE_PROFIT は、同じ条件が2本連続した場合のみ確定する。
  1本目は WATCH（確認待ち）として保留する。

前日高値・前日安値:
  - current_price > previous_high: 上昇継続材料として STAY 寄り（reason で明示）
  - current_price < previous_low : STOP_LOSS候補（2本連続確認）
  - 過去に前日高値を上抜けたが現在は下回っている: ブレイク失速として WATCH

寄り付き30分レンジ（09:00〜09:30の5分足から算出。09:30前は未確定のためスキップ）:
  - current_price > opening_30min_high: 上昇継続材料として STAY 寄り
  - current_price < opening_30min_low : STOP_LOSS候補（2本連続確認）
  - 過去に寄り付き高値を上抜けたが現在は下回っている: ブレイク失速として WATCH

出来高急増の継続性（volume_ma3 / volume_ma6 / volume_ma12 から算出）:
  - volume_ratio_3_12 >= 1.5（volume_surge_continuation）: 上昇継続材料として STAY 寄り
    （前日/寄り付き高値ブレイク中なら強いSTAY材料として reason を強調）
  - volume_ratio_3_12 < 0.7（volume_fading）: WATCH。利益が出ている場合や
    高値ブレイク失速とセットの場合は reason で利益確定候補である旨を付記

ATRベースの損切り（true_range の直近14本平均 atr_14 から算出。
5分足が少なすぎる場合や atr_14 が None/0 の場合はスキップ）:
  - current_price < entry_price - atr_14*2 : STOP_LOSS候補（2本連続確認）
  - atr_stop_price の1%以内まで接近: WATCH
  - atr_stop_price より十分上 かつ VWAPより上 かつ 出来高急増継続: STAY 寄り
"""

import logging
from datetime import datetime

import pandas as pd

from config import (
    ABNORMAL_VOLUME_RATIO as _ABNORMAL_VOLUME_RATIO,
    ATR_NEAR_PCT as _ATR_NEAR_PCT,
    ATR_PERIOD as _ATR_PERIOD,
    ATR_STOP_MULTIPLIER as _ATR_STOP_MULTIPLIER,
    BAR_CHANGE_STRONG_PCT as _BAR_CHANGE_STRONG_PCT,
    BUY_SCORE_THRESHOLD as _BUY_SCORE_THRESHOLD,
    CONFIRM_BARS as _CONFIRM_BARS,
    ENTRY_SCORE_POINTS as _ENTRY_SCORE_POINTS,
    ENTRY_SCORE_THRESHOLD as _ENTRY_SCORE_THRESHOLD,
    MIN_BARS_FOR_ATR as _MIN_BARS_FOR_ATR,
    OPENING_RANGE_END as _OPENING_RANGE_END,
    OPENING_RANGE_START as _OPENING_RANGE_START,
    STOP_LOSS_PCT as _STOP_LOSS_PROFIT_PCT,
    TAKE_PROFIT_PCT as _TAKE_PROFIT_PROFIT_PCT,
    VOLUME_DECLINE_RATIO as _VOLUME_DECLINE_RATIO,
    VOLUME_FADING_RATIO as _VOLUME_FADING_RATIO,
    VOLUME_SURGE_CONTINUATION_RATIO as _VOLUME_SURGE_CONTINUATION_RATIO,
    VWAP_NEAR_PCT as _VWAP_NEAR_PCT,
    WATCH_CANDIDATE_THRESHOLD as _WATCH_CANDIDATE_THRESHOLD,
)

logger = logging.getLogger(__name__)

# 買いエントリー候補判定（ENTRY_SCORE）。既存の signal 列とは独立した判定で、
# entry_score / entry_candidate として別フィールドに出力する。
# しきい値は settings.yaml の trade_decision セクションで変更できる。

# signal_history で「変化イベント」として扱うシグナル（STAYへの遷移はイベントにしない）
_EVENT_SIGNALS = {"ENTRY", "WATCH", "WATCH_STRONG", "TAKE_PROFIT", "STOP_LOSS"}

_RAW_CONDITION_CONFIRMED = {
    "loss":              ("STOP_LOSS",   f"{_STOP_LOSS_PROFIT_PCT}%以下が2本連続したため損切り"),
    "vwap_break":        ("STOP_LOSS",   "VWAP割れが2本連続したため損切り"),
    "prev_low_break":    ("STOP_LOSS",   "前日安値割れが2本連続したため損切り"),
    "opening_low_break": ("STOP_LOSS",   "寄り付き30分安値割れが2本連続したため損切り"),
    "atr_stop_break":    ("STOP_LOSS",   "ATR損切りライン割れが2本連続したため損切り"),
    "profit_take":       ("TAKE_PROFIT", f"+{_TAKE_PROFIT_PROFIT_PCT}%以上が2本連続したため利益確定"),
}

_RAW_CONDITION_PENDING_REASON = {
    "loss":              f"損益率が{_STOP_LOSS_PROFIT_PCT}%以下のため確認中（1本目）",
    "vwap_break":        "現在価格がVWAP未満のため確認中（1本目）",
    "prev_low_break":    "前日安値割れのため確認中（1本目）",
    "opening_low_break": "寄り付き30分安値割れのため確認中（1本目）",
    "atr_stop_break":    "ATR損切りライン割れのため確認中（1本目）",
    "profit_take":       f"損益率が+{_TAKE_PROFIT_PROFIT_PCT}%以上のため確認中（1本目）",
}


def compute_metrics(df_code: pd.DataFrame) -> dict:
    """
    指定銘柄の5分足データから vwap, volume_ma3, volume_ma6, volume_ma12,
    volume_decline_flag, volume_ratio_3_12, volume_surge_continuation,
    volume_fading, bar_change_pct（直近1本の変化率）, abnormal_volume_flag を計算する。
    5分足が12本未満の場合、各移動平均は計算できる範囲（tail）で算出する。
    """
    df_sorted = df_code.sort_values("datetime")

    typical_price = (df_sorted["high"] + df_sorted["low"] + df_sorted["close"]) / 3
    volume_sum = df_sorted["volume"].sum()
    if volume_sum:
        vwap = (typical_price * df_sorted["volume"]).sum() / volume_sum
    else:
        # 出来高がすべて0（出来高停止・新規上場直後など）はVWAPを定義できないため直近終値で代替する
        vwap = float(df_sorted["close"].iloc[-1])

    volume_ma3 = df_sorted["volume"].tail(3).mean()
    volume_ma6 = df_sorted["volume"].tail(6).mean()
    volume_ma12 = df_sorted["volume"].tail(12).mean()
    volume_decline_flag = bool(volume_ma3 < volume_ma6 * _VOLUME_DECLINE_RATIO)

    if volume_ma12:
        volume_ratio_3_12 = volume_ma3 / volume_ma12
    else:
        volume_ratio_3_12 = None
    volume_surge_continuation = bool(
        volume_ratio_3_12 is not None and volume_ratio_3_12 >= _VOLUME_SURGE_CONTINUATION_RATIO
    )
    volume_fading = bool(volume_ratio_3_12 is not None and volume_ratio_3_12 < _VOLUME_FADING_RATIO)

    latest = df_sorted.iloc[-1]
    bar_change_pct = (latest["close"] - latest["open"]) / latest["open"] * 100 if latest["open"] else 0.0
    abnormal_volume_flag = bool(volume_ma6 and latest["volume"] >= volume_ma6 * _ABNORMAL_VOLUME_RATIO)

    return {
        "vwap":                      round(float(vwap), 2),
        "volume_ma3":                round(float(volume_ma3), 2),
        "volume_ma6":                round(float(volume_ma6), 2),
        "volume_ma12":               round(float(volume_ma12), 2),
        "volume_decline_flag":       volume_decline_flag,
        "volume_ratio_3_12":         round(volume_ratio_3_12, 2) if volume_ratio_3_12 is not None else None,
        "volume_surge_continuation": volume_surge_continuation,
        "volume_fading":             volume_fading,
        "bar_change_pct":            round(float(bar_change_pct), 2),
        "abnormal_volume_flag":      abnormal_volume_flag,
    }


def compute_opening_range(df_code: pd.DataFrame) -> dict:
    """
    当日の5分足データから 09:00〜09:30 の高値最大値・安値最小値を計算する。
    最新の足が09:30未満（レンジ未確定）、または09:00〜09:30の足が
    存在しない場合は None を返す（呼び出し側で判定をスキップする）。
    """
    df_sorted = df_code.sort_values("datetime")
    dt = pd.to_datetime(df_sorted["datetime"])

    if dt.iloc[-1].time() < _OPENING_RANGE_END:
        return {"opening_30min_high": None, "opening_30min_low": None}

    mask = (dt.dt.time >= _OPENING_RANGE_START) & (dt.dt.time < _OPENING_RANGE_END)
    opening_bars = df_sorted[mask.to_numpy()]
    if opening_bars.empty:
        return {"opening_30min_high": None, "opening_30min_low": None}

    return {
        "opening_30min_high": round(float(opening_bars["high"].max()), 2),
        "opening_30min_low":  round(float(opening_bars["low"].min()), 2),
    }


def compute_atr(df_code: pd.DataFrame) -> dict:
    """
    指定銘柄の5分足データから true_range の直近14本平均（atr_14）を計算する。
    5分足が _MIN_BARS_FOR_ATR 本未満（前の足の終値が得られない）場合は
    None を返す（呼び出し側でATR判定をスキップする）。
    14本未満でも取得できる本数で暫定計算する。
    """
    df_sorted = df_code.sort_values("datetime")
    if len(df_sorted) < _MIN_BARS_FOR_ATR:
        return {"atr_14": None}

    highs = df_sorted["high"].to_numpy()
    lows = df_sorted["low"].to_numpy()
    closes = df_sorted["close"].to_numpy()

    true_ranges = [
        max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        for i in range(1, len(df_sorted))
    ]
    if not true_ranges:
        return {"atr_14": None}

    recent = true_ranges[-_ATR_PERIOD:]
    return {"atr_14": round(float(sum(recent) / len(recent)), 2)}


def _raw_condition(
    profit_pct: float,
    current_price: float,
    vwap: float,
    breakdown_prev_low_flag: bool,
    opening_range_breakdown: bool,
    atr_stop_loss_flag: bool,
) -> str | None:
    """STOP_LOSS / TAKE_PROFIT の確定対象となる生条件（2本連続確認用）を判定する"""
    if profit_pct <= _STOP_LOSS_PROFIT_PCT:
        return "loss"
    if current_price < vwap:
        return "vwap_break"
    if breakdown_prev_low_flag:
        return "prev_low_break"
    if opening_range_breakdown:
        return "opening_low_break"
    if atr_stop_loss_flag:
        return "atr_stop_break"
    if profit_pct >= _TAKE_PROFIT_PROFIT_PCT:
        return "profit_take"
    return None


def _watch_strong_reason(bar_change_pct: float, abnormal_volume_flag: bool) -> str:
    reasons = []
    if bar_change_pct >= _BAR_CHANGE_STRONG_PCT:
        reasons.append(f"5分足1本で+{_BAR_CHANGE_STRONG_PCT}%以上の急騰のため強い警戒")
    if bar_change_pct <= -_BAR_CHANGE_STRONG_PCT:
        reasons.append(f"5分足1本で-{_BAR_CHANGE_STRONG_PCT}%以下の急落のため強い警戒")
    if abnormal_volume_flag:
        reasons.append(f"出来高が直近6本平均の{_ABNORMAL_VOLUME_RATIO}倍以上のため強い警戒")
    return "、".join(reasons)


def decide_signal(
    profit_pct: float,
    current_price: float,
    vwap: float,
    volume_decline_flag: bool,
    bar_change_pct: float,
    abnormal_volume_flag: bool,
    confirmation_count: int,
    raw_condition: str | None,
    breakout_prev_high_flag: bool,
    breakout_fade: bool,
    opening_range_breakout: bool,
    opening_fade: bool,
    volume_surge_continuation: bool,
    volume_fading: bool,
    atr_near_flag: bool,
    atr_stop_available: bool,
    vwap_near_flag: bool,
) -> tuple[str, str, str]:
    """
    優先順位 WATCH_STRONG > STOP_LOSS > TAKE_PROFIT > WATCH > STAY で
    (signal, reason, signal_strength) を返す。
    """
    if bar_change_pct >= _BAR_CHANGE_STRONG_PCT or bar_change_pct <= -_BAR_CHANGE_STRONG_PCT or abnormal_volume_flag:
        return "WATCH_STRONG", _watch_strong_reason(bar_change_pct, abnormal_volume_flag), "STRONG"

    if raw_condition is not None:
        if confirmation_count >= _CONFIRM_BARS:
            signal, reason = _RAW_CONDITION_CONFIRMED[raw_condition]
            return signal, reason, "CONFIRMED"
        return "WATCH", _RAW_CONDITION_PENDING_REASON[raw_condition], "PENDING"

    if breakout_fade or opening_fade:
        if volume_fading:
            return "WATCH", "高値圏で出来高が失速しているため利益確定候補", "NONE"
        base = (
            "前日高値ブレイク後に失速しているため警戒"
            if breakout_fade
            else "寄り付き30分高値ブレイク後に失速しているため警戒"
        )
        if profit_pct > 0:
            return "WATCH", f"{base}（利益確定を検討）", "NONE"
        return "WATCH", base, "NONE"

    if volume_fading:
        if profit_pct > 0:
            return "WATCH", "出来高が急減しているため警戒（利益確定を検討）", "NONE"
        return "WATCH", "出来高が急減しているため警戒", "NONE"

    if profit_pct > 0 and volume_decline_flag:
        return "WATCH", "利益が出ているが出来高が減少傾向", "NONE"
    if vwap_near_flag:
        return "WATCH", "現在価格がVWAPの1%以内", "NONE"
    if atr_near_flag:
        return "WATCH", "ATR損切りラインに接近しているため警戒", "NONE"

    if breakout_prev_high_flag or opening_range_breakout:
        base = (
            "前日高値を上抜けているため上昇継続"
            if breakout_prev_high_flag
            else "寄り付き30分高値を上抜けているため上昇継続"
        )
        if volume_surge_continuation:
            return "STAY", f"{base}（出来高急増継続のため強い継続材料）", "NONE"
        return "STAY", base, "NONE"

    if volume_surge_continuation and current_price > vwap and atr_stop_available:
        return "STAY", "ATR損切りラインから十分離れており、VWAPより上で出来高急増が継続しているため上昇継続", "NONE"

    if volume_surge_continuation:
        return "STAY", "出来高急増が継続しているため保有継続", "NONE"

    return "STAY", "条件に該当なし", "NONE"


_RAW_CONDITION_CORE = {
    "loss":              f"損益率が{_STOP_LOSS_PROFIT_PCT}%以下が2本連続",
    "vwap_break":        "VWAP割れが2本連続",
    "prev_low_break":    "前日安値割れが2本連続",
    "opening_low_break": "寄り付き30分安値割れが2本連続",
    "atr_stop_break":    "ATR損切りライン割れが2本連続",
    "profit_take":       f"+{_TAKE_PROFIT_PROFIT_PCT}%以上が2本連続",
}

_AUX_CONFIRMED_PHRASES = {
    "loss":              "損益率も-2%以下",
    "vwap_break":        "VWAPも割れている",
    "prev_low_break":    "前日安値も割れている",
    "opening_low_break": "寄り付き30分安値も割れている",
    "atr_stop_break":    "ATR損切りラインも下回っている",
}


def _rank_score(rank: int | None) -> tuple[int, str | None]:
    """注目銘柄ランキング順位に応じた段階加点を返す（1〜3位/4〜5位/6〜10位/対象外）"""
    if rank is None:
        return 0, None
    if rank <= 3:
        return _ENTRY_SCORE_POINTS["rank_1_3"], "注目銘柄ランキング1〜3位"
    if rank <= 5:
        return _ENTRY_SCORE_POINTS["rank_4_5"], "注目銘柄ランキング4〜5位"
    if rank <= 10:
        return _ENTRY_SCORE_POINTS["rank_6_10"], "注目銘柄ランキング6〜10位"
    return 0, None


def compute_entry_score(ctx: dict) -> dict:
    """
    買いエントリー候補判定（ENTRY_SCORE, 0〜100）を計算する。
    既存の signal（STAY/WATCH/WATCH_STRONG/TAKE_PROFIT/STOP_LOSS/ENTRY）とは
    独立した判定で、entry_score / entry_candidate として別出力する。

    配点（settings.yaml の trade_decision.entry_score_points で変更可）:
    VWAPより上 / 前日高値ブレイク / 寄り付き30分高値ブレイク / 出来高急増継続が
    各+20、注目銘柄ランキングは1〜3位+15・4〜5位+12・6〜10位+10、
    地合いが「普通」「強い」なら+5、「悪い」なら減点（デフォルト-15）。

    85点以上: ENTRY / 70〜84点: WATCH / 70点未満: NO_ENTRY
    """
    score = 0
    factors: list[str] = []

    if ctx["current_price"] > ctx["vwap"]:
        score += _ENTRY_SCORE_POINTS["vwap_above"]
        factors.append("VWAPより上")
    if ctx["breakout_prev_high_flag"]:
        score += _ENTRY_SCORE_POINTS["prev_high_breakout"]
        factors.append("前日高値ブレイク")
    if ctx["opening_range_breakout"]:
        score += _ENTRY_SCORE_POINTS["opening_range_breakout"]
        factors.append("寄り付き30分高値ブレイク")
    if ctx["volume_surge_continuation"]:
        score += _ENTRY_SCORE_POINTS["volume_surge_continuation"]
        factors.append("出来高急増継続")

    rank_points, rank_factor = _rank_score(ctx.get("rank"))
    if rank_points:
        score += rank_points
        factors.append(rank_factor)

    market_sentiment_label = ctx.get("market_sentiment_label")
    if market_sentiment_label in ("普通", "強い"):
        score += _ENTRY_SCORE_POINTS["market_bull"]
        factors.append("地合いが悪くない")
    elif market_sentiment_label == "悪い":
        score += _ENTRY_SCORE_POINTS["market_bear_penalty"]
        factors.append("地合いが悪い")

    score = max(0, score)

    if score >= _ENTRY_SCORE_THRESHOLD:
        entry_candidate = "ENTRY"
    elif score >= _WATCH_CANDIDATE_THRESHOLD:
        entry_candidate = "WATCH"
    else:
        entry_candidate = "NO_ENTRY"

    return {"entry_score": score, "entry_candidate": entry_candidate, "entry_factors": factors}


def compute_final_action(row: dict) -> dict:
    """
    売買判断（final_action）を BUY / WAIT / SELL の3値で判定する。
    既存の signal（STAY/WATCH/WATCH_STRONG/TAKE_PROFIT/STOP_LOSS/ENTRY）・
    entry_candidate（ENTRY/WATCH/NO_ENTRY）はどちらも変更せず、それらの値を
    入力として独立に判定する新規フロー（自動売買は行わず判断支援のみ）。

    優先順位 SELL > BUY > WAIT。

    SELL: 以下のいずれかに該当
      - signal が STOP_LOSS
      - signal が TAKE_PROFIT
      - signal が WATCH_STRONG かつ profit_pct > 0

    BUY: SELL条件に該当せず、以下をすべて満たす
      - entry_candidate が ENTRY
      - entry_score が settings.yaml の buy_score_threshold 以上
      - current_price が vwap より上
      - volume_surge_continuation が True
      - signal が STOP_LOSS / TAKE_PROFIT / WATCH_STRONG のいずれでもない

    WAIT: 上記以外。

    必須キー: signal, profit_pct, entry_candidate, entry_score, current_price, vwap,
    volume_surge_continuation
    """
    signal = row["signal"]
    profit_pct = row.get("profit_pct") or 0.0
    entry_candidate = row.get("entry_candidate")
    entry_score = row.get("entry_score") or 0
    current_price = row.get("current_price")
    vwap = row.get("vwap")
    volume_surge_continuation = bool(row.get("volume_surge_continuation"))

    is_sell = bool(
        signal == "STOP_LOSS"
        or signal == "TAKE_PROFIT"
        or (signal == "WATCH_STRONG" and profit_pct > 0)
    )

    if is_sell:
        if signal == "STOP_LOSS":
            reason = "STOP_LOSSが確定したためSELL"
        elif signal == "TAKE_PROFIT":
            reason = "TAKE_PROFITが確定したためSELL"
        else:
            reason = "WATCH_STRONG（急騰急落の強い警戒）かつ利益が出ているためSELL"
        return {
            "final_action": "SELL",
            "final_action_score": 100,
            "final_action_reason": reason,
        }

    not_sell_signal = signal not in ("STOP_LOSS", "TAKE_PROFIT", "WATCH_STRONG")
    above_vwap = bool(current_price is not None and vwap is not None and current_price > vwap)

    is_buy = bool(
        entry_candidate == "ENTRY"
        and entry_score >= _BUY_SCORE_THRESHOLD
        and above_vwap
        and volume_surge_continuation
        and not_sell_signal
    )

    if is_buy:
        score = entry_score
        if above_vwap:
            score += 5
        if volume_surge_continuation:
            score += 5
        score = max(0, min(100, score))
        return {
            "final_action": "BUY",
            "final_action_score": score,
            "final_action_reason": "ENTRY_SCOREが高く、VWAP上、出来高急増が継続しているためBUY",
        }

    return {
        "final_action": "WAIT",
        "final_action_score": max(0, min(100, entry_score)),
        "final_action_reason": "BUY/SELLの条件を満たさないためWAIT",
    }


def compute_factors(ctx: dict) -> dict:
    """
    STAY/WATCH寄りの判断材料を検出し、(ラベル, reason用フレーズ) のリストと
    スコア加減点（score_delta）を返す。判定（signal）そのものには影響しない。
    """
    positive: list[tuple[str, str]] = []
    negative: list[tuple[str, str]] = []
    score_delta = 0

    if ctx["current_price"] > ctx["vwap"]:
        positive.append(("VWAPより上", "VWAP上を維持し"))
        score_delta += 15
    if ctx["breakout_prev_high_flag"]:
        positive.append(("前日高値を上抜け", "前日高値を上抜け"))
        score_delta += 15
    if ctx["opening_range_breakout"]:
        positive.append(("寄り付き30分高値を上抜け", "寄り付き30分高値を上抜け"))
        score_delta += 15
    if ctx["volume_surge_continuation"]:
        positive.append(("出来高急増継続", "出来高急増も継続している"))
        score_delta += 15
    if ctx["atr_stop_price"] is not None and not ctx["atr_stop_loss_flag"] and not ctx["atr_near_flag"]:
        positive.append(("ATR損切りラインより十分上", "ATR損切りラインからも十分離れている"))
        score_delta += 10
    if ctx["profit_pct"] > 0:
        positive.append(("損益率がプラス", "利益は出ている"))
        score_delta += 10

    if ctx["vwap_near_flag"]:
        negative.append(("VWAP接近", "VWAPに接近している"))
        score_delta -= 10
    if ctx["volume_fading"]:
        negative.append(("出来高失速", "出来高が失速し"))
        score_delta -= 15
    if ctx["breakout_fade"]:
        negative.append(("前日高値ブレイク後に失速", "前日高値ブレイク後に失速している"))
        score_delta -= 20
    if ctx["opening_fade"]:
        negative.append(("寄り付き30分高値ブレイク後に失速", "寄り付き30分高値ブレイク後に失速している"))
        score_delta -= 20
    if ctx["atr_near_flag"]:
        negative.append(("ATR損切りライン接近", "ATR損切りラインに接近している"))
        score_delta -= 20
    if ctx.get("market_sentiment_bad"):
        negative.append(("市場地合いが悪い", "市場全体の地合いが悪い"))
        score_delta -= 15

    return {"positive": positive, "negative": negative, "score_delta": score_delta}


def compute_signal_score(signal: str, score_delta: int) -> int:
    """
    0〜100点のシグナル強度。STOP_LOSS/TAKE_PROFITは強制確定のため固定値、
    それ以外は基準点50に加減点した値（0〜100にクリップ）を返す。
    """
    if signal == "STOP_LOSS":
        return 0
    if signal == "TAKE_PROFIT":
        return 100
    return max(0, min(100, 50 + score_delta))


def compute_risk_level(signal: str, signal_score: int) -> str:
    """LOW / MEDIUM / HIGH のリスクレベルを返す"""
    if signal in ("STOP_LOSS", "WATCH_STRONG"):
        return "HIGH"
    if signal in ("TAKE_PROFIT", "WATCH"):
        return "MEDIUM"
    if signal == "STAY":
        return "LOW" if signal_score >= 70 else "MEDIUM"
    return "MEDIUM"


def _build_confirmed_reason(signal: str, raw_condition: str, raw_states: dict) -> str:
    """
    2本連続確認で確定した STOP_LOSS / TAKE_PROFIT の reason を、
    主因（raw_condition）と他に成立している同系条件（aux）を組み合わせて生成する。
    """
    core = _RAW_CONDITION_CORE[raw_condition]
    tail = "ため損切り" if signal == "STOP_LOSS" else "ため利益確定"

    if signal == "STOP_LOSS":
        aux = [
            _AUX_CONFIRMED_PHRASES[key]
            for key in ("loss", "vwap_break", "prev_low_break", "opening_low_break", "atr_stop_break")
            if key != raw_condition and raw_states.get(key)
        ]
        if aux:
            return core + "し、" + "、".join(aux) + tail

    return core + tail


def _build_watch_reason(positive: list, negative: list, fallback_reason: str) -> str:
    """raw_condition によらない単純なWATCH（fade/出来高失速/VWAP・ATR接近等）の reason を組み立てる"""
    pos_text = "、".join(p for _, p in positive)
    neg_text = "、".join(p for _, p in negative)

    if pos_text and neg_text:
        return f"{pos_text}が、{neg_text}ため警戒"
    if neg_text:
        return f"{neg_text}ため警戒"
    if pos_text:
        return f"{pos_text}が、警戒材料はないため監視継続"
    return fallback_reason


def _build_stay_reason(positive: list, fallback_reason: str) -> str:
    """STAYの reason を、成立しているプラス材料から組み立てる（材料がなければ元のreasonを使う）"""
    if not positive:
        return fallback_reason
    return "、".join(p for _, p in positive) + "ため保有継続"


def _compute_confirmation_count(raw_condition: str | None, prev: dict | None) -> int:
    """
    直前の判定結果（DB保存値）から再計算した生条件と比較し、
    同じ条件が連続している本数を返す。条件がなければ 0。
    """
    if raw_condition is None:
        return 0
    if prev is None:
        return 1

    prev_raw = _raw_condition(
        prev["profit_pct"], prev["current_price"], prev["vwap"],
        bool(prev.get("breakdown_prev_low_flag")),
        bool(prev.get("opening_range_breakdown")),
        bool(prev.get("atr_stop_loss_flag")),
    )
    if prev_raw == raw_condition:
        return (prev["confirmation_count"] or 0) + 1
    return 1


def run_trade_decision(
    df_prices: pd.DataFrame,
    df_positions: pd.DataFrame,
    previous_ohlc: dict[str, dict | None] | None = None,
    market_sentiment: dict | None = None,
) -> pd.DataFrame:
    """
    取得済みの5分足データ・損益計算結果・前日OHLC・市場環境（地合い）から、
    銘柄ごとにデイトレ判定を行う。
    結果は trade_signals / signal_history テーブルに保存され、
    (df_signals, df_history) の DataFrame タプルで返される。
    previous_ohlc が None または該当銘柄のOHLCが取得できない場合は、
    前日高値・安値に関する判定のみスキップし、他の判定は継続する。
    寄り付き30分レンジが未確定（09:30前）または5分足が不足している場合も
    同様にそのレンジ判定のみスキップする。
    market_sentiment（fetch_yfinance.classify_market_sentiment の返値）が
    None または地合いを判定できなかった場合は、市場環境による補正をスキップする。
    地合いが「悪い」場合は signal_score を減点し、STAY判定はWATCHに補正する
    （ENTRY/STOP_LOSS/TAKE_PROFIT/WATCH_STRONGの判定ロジック自体は変更しない）。
    """
    from db import get_latest_rank, get_latest_trade_signal, upsert_signal_history, upsert_trade_signals

    if df_prices.empty or df_positions.empty:
        return pd.DataFrame(), pd.DataFrame()

    previous_ohlc = previous_ohlc or {}
    market_sentiment = market_sentiment or {}
    market_sentiment_label = market_sentiment.get("market_sentiment")
    market_change_pct = market_sentiment.get("market_change_pct")
    market_sentiment_bad = bool(market_sentiment_label == "悪い")

    signal_datetime = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    signals = []
    history_rows = []

    for _, pos in df_positions.iterrows():
        code = pos["code"]
        df_code = df_prices[df_prices["code"] == code]
        if df_code.empty:
            logger.warning("銘柄 %s: 5分足データがないため判定をスキップ", code)
            continue

        try:
            metrics = compute_metrics(df_code)
        except Exception as e:
            logger.warning("銘柄 %s: メトリクス計算に失敗したため判定をスキップ: %s", code, e)
            continue
        profit_pct = pos["profit_pct"]
        current_price = pos["current_price"]
        vwap = metrics["vwap"]

        ohlc = previous_ohlc.get(code)
        previous_high  = ohlc["high"]  if ohlc else None
        previous_low   = ohlc["low"]   if ohlc else None
        previous_close = ohlc["close"] if ohlc else None

        breakout_prev_high_flag = bool(previous_high is not None and current_price > previous_high)
        breakdown_prev_low_flag = bool(previous_low is not None and current_price < previous_low)

        opening_range = compute_opening_range(df_code)
        opening_30min_high = opening_range["opening_30min_high"]
        opening_30min_low  = opening_range["opening_30min_low"]

        opening_range_breakout = bool(opening_30min_high is not None and current_price > opening_30min_high)
        opening_range_breakdown = bool(opening_30min_low is not None and current_price < opening_30min_low)

        rank = get_latest_rank(code)

        entry_score_info = compute_entry_score({
            "current_price":             current_price,
            "vwap":                      vwap,
            "breakout_prev_high_flag":   breakout_prev_high_flag,
            "opening_range_breakout":    opening_range_breakout,
            "volume_surge_continuation": metrics["volume_surge_continuation"],
            "rank":                      rank,
            "market_sentiment_label":    market_sentiment_label,
        })

        atr_metrics = compute_atr(df_code)
        atr_14 = atr_metrics["atr_14"]
        if atr_14:
            atr_stop_price = round(pos["entry_price"] - atr_14 * _ATR_STOP_MULTIPLIER, 2)
            atr_stop_loss_flag = bool(current_price < atr_stop_price)
        else:
            atr_stop_price = None
            atr_stop_loss_flag = False
        atr_near_flag = bool(
            atr_stop_price and not atr_stop_loss_flag
            and abs(current_price - atr_stop_price) / atr_stop_price <= _ATR_NEAR_PCT
        )
        vwap_near_flag = bool(vwap and abs(current_price - vwap) / vwap <= _VWAP_NEAR_PCT)

        prev = get_latest_trade_signal(code)
        breakout_fade = bool(
            previous_high is not None
            and prev is not None
            and prev.get("breakout_prev_high_flag")
            and not breakout_prev_high_flag
        )
        opening_fade = bool(
            opening_30min_high is not None
            and prev is not None
            and prev.get("opening_range_breakout")
            and not opening_range_breakout
        )

        raw = _raw_condition(
            profit_pct, current_price, vwap, breakdown_prev_low_flag,
            opening_range_breakdown, atr_stop_loss_flag,
        )
        confirmation_count = _compute_confirmation_count(raw, prev)

        signal, original_reason, strength = decide_signal(
            profit_pct, current_price, vwap, metrics["volume_decline_flag"],
            metrics["bar_change_pct"], metrics["abnormal_volume_flag"], confirmation_count,
            raw, breakout_prev_high_flag, breakout_fade,
            opening_range_breakout, opening_fade,
            metrics["volume_surge_continuation"], metrics["volume_fading"],
            atr_near_flag, atr_stop_price is not None, vwap_near_flag,
        )

        factors = compute_factors({
            "current_price":             current_price,
            "vwap":                      vwap,
            "vwap_near_flag":            vwap_near_flag,
            "breakout_prev_high_flag":   breakout_prev_high_flag,
            "opening_range_breakout":    opening_range_breakout,
            "volume_surge_continuation": metrics["volume_surge_continuation"],
            "volume_fading":             metrics["volume_fading"],
            "breakout_fade":             breakout_fade,
            "opening_fade":              opening_fade,
            "atr_stop_price":            atr_stop_price,
            "atr_stop_loss_flag":        atr_stop_loss_flag,
            "atr_near_flag":             atr_near_flag,
            "profit_pct":                profit_pct,
            "market_sentiment_bad":      market_sentiment_bad,
        })

        # 市場地合いが悪い場合、STAYはWATCH寄りに補正する
        # （ENTRY/STOP_LOSS/TAKE_PROFIT/WATCH_STRONGはより緊急性の高い判定のため変更しない）。
        if market_sentiment_bad and signal == "STAY":
            signal = "WATCH"

        signal_score = compute_signal_score(signal, factors["score_delta"])
        risk_level = compute_risk_level(signal, signal_score)

        if signal == "STAY":
            reason = _build_stay_reason(factors["positive"], original_reason)
        elif signal == "WATCH":
            if raw is not None and confirmation_count < _CONFIRM_BARS:
                reason = original_reason
            else:
                reason = _build_watch_reason(factors["positive"], factors["negative"], original_reason)
        elif signal in ("STOP_LOSS", "TAKE_PROFIT") and raw is not None and confirmation_count >= _CONFIRM_BARS:
            raw_states = {
                "loss":              profit_pct <= _STOP_LOSS_PROFIT_PCT,
                "vwap_break":        current_price < vwap,
                "prev_low_break":    breakdown_prev_low_flag,
                "opening_low_break": opening_range_breakdown,
                "atr_stop_break":    atr_stop_loss_flag,
            }
            reason = _build_confirmed_reason(signal, raw, raw_states)
        else:
            reason = original_reason

        if not reason:
            reason = "条件に該当なし"

        positive_factors = "、".join(label for label, _ in factors["positive"])
        negative_factors = "、".join(label for label, _ in factors["negative"])
        # 非推奨: LINE通知判定には signal_history.changed_flag を使うこと。
        # こちらは後方互換のため残しているのみで、STAYを除外しない点が changed_flag と異なる。
        signal_changed = bool(prev is None or prev.get("signal") != signal)

        # 新規エントリー（この銘柄の初回判定）はSTAY/WATCHより優先して通知対象の
        # ENTRY とする。STOP_LOSS/TAKE_PROFIT/WATCH_STRONG はより緊急性が高いため上書きしない。
        # raw が not None の WATCH（損切り/利確条件の1本目確認中）は警戒状態なので、
        # 矛盾したラベルにならないよう ENTRY への上書き対象から除外する。
        if prev is None and (signal == "STAY" or (signal == "WATCH" and raw is None)):
            reason = f"新規エントリー（エントリー価格{pos['entry_price']}、現在価格{current_price}）。{reason}"
            signal = "ENTRY"

        final_action_info = compute_final_action({
            "signal":                    signal,
            "profit_pct":                profit_pct,
            "entry_candidate":           entry_score_info["entry_candidate"],
            "entry_score":               entry_score_info["entry_score"],
            "current_price":             current_price,
            "vwap":                      vwap,
            "volume_surge_continuation": metrics["volume_surge_continuation"],
        })

        previous_signal = prev.get("signal") if prev is not None else None
        history_changed_flag = bool(signal != previous_signal and signal in _EVENT_SIGNALS)
        history_rows.append({
            "code":             code,
            "signal_datetime":  signal_datetime,
            "previous_signal":  previous_signal,
            "current_signal":   signal,
            "changed_flag":     int(history_changed_flag),
            "reason":           reason,
        })

        signals.append({
            "code":                     code,
            "signal_datetime":          signal_datetime,
            "current_price":            current_price,
            "entry_price":              pos["entry_price"],
            "profit_pct":               profit_pct,
            "signal":                   signal,
            "reason":                   reason,
            "vwap":                     vwap,
            "volume_ma3":               metrics["volume_ma3"],
            "volume_ma6":               metrics["volume_ma6"],
            "volume_decline_flag":      int(metrics["volume_decline_flag"]),
            "bar_change_pct":           metrics["bar_change_pct"],
            "abnormal_volume_flag":     int(metrics["abnormal_volume_flag"]),
            "confirmation_count":       confirmation_count,
            "signal_strength":          strength,
            "previous_high":            previous_high,
            "previous_low":             previous_low,
            "previous_close":           previous_close,
            "breakout_prev_high_flag":  int(breakout_prev_high_flag),
            "breakdown_prev_low_flag":  int(breakdown_prev_low_flag),
            "opening_30min_high":       opening_30min_high,
            "opening_30min_low":        opening_30min_low,
            "opening_range_breakout":   int(opening_range_breakout),
            "opening_range_breakdown":  int(opening_range_breakdown),
            "volume_ma12":              metrics["volume_ma12"],
            "volume_ratio_3_12":        metrics["volume_ratio_3_12"],
            "volume_surge_continuation": int(metrics["volume_surge_continuation"]),
            "volume_fading":            int(metrics["volume_fading"]),
            "atr_14":                   atr_14,
            "atr_stop_price":           atr_stop_price,
            "atr_stop_loss_flag":       int(atr_stop_loss_flag),
            "signal_score":             signal_score,
            "positive_factors":         positive_factors,
            "negative_factors":         negative_factors,
            "risk_level":               risk_level,
            "signal_changed":           int(signal_changed),
            "market_sentiment":         market_sentiment_label,
            "market_change_pct":        market_change_pct,
            "entry_score":              entry_score_info["entry_score"],
            "entry_candidate":          entry_score_info["entry_candidate"],
            "entry_factors":            "、".join(entry_score_info["entry_factors"]),
            "final_action":             final_action_info["final_action"],
            "final_action_score":       final_action_info["final_action_score"],
            "final_action_reason":      final_action_info["final_action_reason"],
        })

    if signals:
        upsert_trade_signals(signals)
        logger.info("デイトレ判定完了: %d 銘柄", len(signals))

    if history_rows:
        upsert_signal_history(history_rows)

    return pd.DataFrame(signals), pd.DataFrame(history_rows)
