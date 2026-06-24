"""
注目銘柄の分析ロジック。

baseline_score（テクニカル25点 + 出来高・資金流入35点、最大60点）を
検証済みのベースラインとして固定し、それ以外の要素は config.SCORE_WEIGHT_*
（デフォルト0）で重み付けして total_score に反映する。

  baseline_score = テクニカル(最大25点) + 出来高・資金流入(最大35点)
  total_score    = baseline_score
                  + ファンダメンタル(最大20点、PER/PBR/ROE等。検証済みのため重み1固定)
                  + SCORE_WEIGHT_EARNINGS_MOMENTUM   × 決算モメンタム(最大90点、EDINET)
                  + SCORE_WEIGHT_RISK_PENALTY        × 過熱・連続上昇ペナルティ(最大-23点)
                  + SCORE_WEIGHT_MARKET_SENTIMENT    × 地合いスコア(±10点)

決算モメンタム・過熱ペナルティ・地合いは1日分の診断から実装したが、
--validate-ranking-all による複数日検証では翌日リターンとの正の相関が
確認できなかったため、SCORE_WEIGHT_* を0にしてランキングへの影響を止めている
（スコア自体は分析結果に保存され続けるため、データ収集とランキングへの反映を分離できる）。
採用ルール・重みを戻す条件は README.md「スコア要素の採用ルール」を参照。
"""

import logging
import sqlite3
from datetime import date, timedelta

import pandas as pd

from config import (
    CONSECUTIVE_UP_DAYS_PENALTY,
    CONSECUTIVE_UP_DAYS_THRESHOLD,
    DB_PATH,
    MARKET_SENTIMENT_BAD_PENALTY,
    MARKET_SENTIMENT_STRONG_BONUS,
    MARKET_SENTIMENT_STRONG_PCT,
    MARKET_SENTIMENT_SYMBOLS,
    MARKET_SENTIMENT_WEAK_PCT,
    MAX_PRICE,
    MAX_PRICE_CHANGE_PCT,
    MIN_PRICE,
    MIN_PRICE_CHANGE_PCT,
    MIN_TURNOVER,
    MIN_VOLUME_RATIO,
    OVERHEAT_CHANGE_PCT_HIGH,
    OVERHEAT_CHANGE_PCT_MID,
    OVERHEAT_PENALTY_HIGH,
    OVERHEAT_PENALTY_MID,
    SCORE_WEIGHT_EARNINGS_MOMENTUM,
    SCORE_WEIGHT_MARKET_SENTIMENT,
    SCORE_WEIGHT_RISK_PENALTY,
)
from fundamental_score import compute_fundamental_score
from fundamentals_fetcher import compute_fundamentals

logger = logging.getLogger(__name__)

_LOOKBACK_DAYS = 50   # ma25 算出に必要な取引日数を確保するためのカレンダー日数


# ── データロード ───────────────────────────────────────────────


def _load_recent_quotes(target_date: str) -> pd.DataFrame:
    """DB から target_date を含む直近データを取得する"""
    cutoff = str(date.fromisoformat(target_date) - timedelta(days=_LOOKBACK_DAYS))
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT dq.date, dq.code, lc.company_name,
               dq.open, dq.high, dq.low, dq.close,
               dq.volume, dq.turnover_value
        FROM daily_quotes dq
        LEFT JOIN listed_companies lc ON dq.code = lc.code
        WHERE dq.date >= ? AND dq.date <= ?
          AND dq.close IS NOT NULL
        ORDER BY dq.code, dq.date
        """,
        conn,
        params=(cutoff, target_date),
    )
    conn.close()
    return df


def _load_fundamental_cache() -> dict:
    """ファンダメンタルデータを {code: dict} で返す。テーブルが空なら空 dict。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query("SELECT * FROM fundamentals", conn)
        return {row["code"]: row.to_dict() for _, row in df.iterrows()}
    except Exception:
        return {}
    finally:
        conn.close()


def _get_fundamental_data(code: str, cache: dict) -> dict | None:
    """
    指定銘柄のファンダメンタルデータを返す。
    手動CSV投入分（fundamentals テーブルの既存キャッシュ）を優先し、無ければ
    EDINETの直近決算書類から算出する（fundamentals_fetcher.compute_fundamentals）。
    EDINET経由で算出できた場合は fundamentals テーブルに保存し、次回以降の
    キャッシュとして使えるようにする。取得・算出に失敗した場合は None を返す
    （呼び出し元は fundamental_score=0点として処理を継続する）。
    """
    cached = cache.get(code)
    if cached:
        return cached

    try:
        data = compute_fundamentals(code)
    except Exception as e:
        logger.warning("銘柄 %s: ファンダメンタル算出に失敗: %s", code, e)
        return None

    if data:
        from db import upsert_fundamentals
        upsert_fundamentals([data])
        cache[code] = data
    return data


def _load_market_sentiment(target_date: str) -> dict:
    """
    market_indices から target_date 時点の地合い（日経平均・TOPIX連動ETF・NASDAQ・
    S&P500の前日比の単純平均）を判定する。データが無ければ判定不可として
    {"market_sentiment": None, "market_change_pct": None} を返す。
    fetch_yfinance.classify_market_sentiment() と同じ閾値・指数を使うが、
    そちらはリアルタイム取得用、これは過去日の DB データを参照する点が異なる。
    """
    conn = sqlite3.connect(DB_PATH)
    try:
        placeholders = ",".join("?" * len(MARKET_SENTIMENT_SYMBOLS))
        df = pd.read_sql_query(
            f"SELECT symbol, date, close FROM market_indices "
            f"WHERE symbol IN ({placeholders}) AND date <= ? ORDER BY date",
            conn, params=(*MARKET_SENTIMENT_SYMBOLS, target_date),
        )
    except Exception as e:
        logger.warning("地合い判定用の市場指数取得に失敗: %s", e)
        return {"market_sentiment": None, "market_change_pct": None}
    finally:
        conn.close()

    if df.empty:
        return {"market_sentiment": None, "market_change_pct": None}

    changes = []
    for _symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        today_rows = grp[grp["date"] == target_date]
        prev_rows = grp[grp["date"] < target_date]
        if today_rows.empty or prev_rows.empty:
            continue
        today_close = _safe(today_rows.iloc[-1]["close"])
        prev_close = _safe(prev_rows.iloc[-1]["close"])
        if today_close and prev_close:
            changes.append((today_close - prev_close) / prev_close * 100)

    if not changes:
        return {"market_sentiment": None, "market_change_pct": None}

    avg = sum(changes) / len(changes)
    if avg >= MARKET_SENTIMENT_STRONG_PCT:
        sentiment = "強い"
    elif avg <= MARKET_SENTIMENT_WEAK_PCT:
        sentiment = "悪い"
    else:
        sentiment = "普通"
    return {"market_sentiment": sentiment, "market_change_pct": round(avg, 2)}


# ── ストップ高判定 ─────────────────────────────────────────────

# 東証の値幅制限（基準値段に対する制限値幅）の標準テーブル。
# (基準値段の上限（未満）, 制限値幅) のペアを価格帯の昇順で並べたもの。
# 実際の制限値幅は基準値段（通常は前日終値）によって決まる固定テーブルであり、
# yfinance 経由では当日の値幅制限（upper_limit）データが取得できないため、
# このテーブルを使って自前で計算する。
_PRICE_LIMIT_TABLE = [
    (100, 30), (200, 50), (300, 80), (500, 100), (700, 150), (1000, 200),
    (1500, 300), (2000, 400), (3000, 500), (5000, 700), (7000, 1000),
    (10000, 1500), (15000, 2000), (20000, 3000), (30000, 4000), (50000, 5000),
    (70000, 7000), (100000, 10000), (150000, 15000), (200000, 20000),
    (300000, 30000), (500000, 50000), (700000, 70000), (1_000_000, 100_000),
    (1_500_000, 150_000), (2_000_000, 200_000), (3_000_000, 300_000),
    (5_000_000, 500_000), (7_000_000, 700_000), (10_000_000, 1_000_000),
    (15_000_000, 1_500_000), (20_000_000, 2_000_000), (30_000_000, 3_000_000),
    (50_000_000, 5_000_000),
]


def _price_limit_move(prev_close: float) -> float:
    """前日終値（基準値段）に対する制限値幅を返す（東証の標準テーブル）"""
    for threshold, move in _PRICE_LIMIT_TABLE:
        if prev_close < threshold:
            return move
    return _PRICE_LIMIT_TABLE[-1][1]


def _is_stop_high(prev_close: float | None, close: float | None) -> bool:
    """前日終値からの値幅制限テーブルに基づき、本日ストップ高（上限値に到達）かを判定する"""
    if not prev_close or prev_close <= 0 or not close:
        return False
    limit_price = prev_close + _price_limit_move(prev_close)
    return close >= limit_price - 0.5  # 丸め誤差を許容


# ── 特徴量計算 ─────────────────────────────────────────────────


def _safe(val) -> float | None:
    try:
        v = float(val)
        return v if pd.notna(v) else None
    except (TypeError, ValueError):
        return None


def _compute_features(df: pd.DataFrame, target_date: str) -> pd.DataFrame:
    """各銘柄の特徴量を計算して target_date 分のみ返す"""
    records = []

    for code, grp in df.groupby("code"):
        grp = grp.sort_values("date").reset_index(drop=True)
        today_rows = grp[grp["date"] == target_date]
        if today_rows.empty:
            continue

        today = today_rows.iloc[-1]
        close   = _safe(today["close"])
        volume  = _safe(today["volume"])
        open_   = _safe(today["open"])
        high    = _safe(today["high"])
        low     = _safe(today["low"])
        tv_today = _safe(today["turnover_value"])
        trading_value = tv_today if tv_today else (close * volume if close and volume else None)

        if not close or close <= 0:
            continue

        # 前日終値
        prev_rows = grp[grp["date"] < target_date]
        if prev_rows.empty:
            continue
        prev_close = _safe(prev_rows.iloc[-1]["close"])
        if not prev_close or prev_close <= 0:
            continue

        change_pct = (close - prev_close) / prev_close * 100

        # 時系列データ（当日含む）
        past = grp[grp["date"] <= target_date]
        closes   = past["close"].apply(_safe).dropna()
        volumes  = past["volume"].apply(_safe).dropna()
        highs    = past["high"].apply(_safe).dropna()

        tv_series = past["turnover_value"].apply(_safe)
        if tv_series.isna().all():
            tv_series = (past["close"].apply(_safe) * past["volume"].apply(_safe)).dropna()
        else:
            tv_series = tv_series.dropna()

        # 移動平均
        ma5   = float(closes.tail(5).mean())  if len(closes) >= 2  else None
        ma25  = float(closes.tail(25).mean()) if len(closes) >= 10 else None
        ma5_gap_pct  = ((close - ma5)  / ma5  * 100) if ma5  else None
        ma25_gap_pct = ((close - ma25) / ma25 * 100) if ma25 else None

        # 出来高系
        vol_ma5  = float(volumes.tail(5).mean())  if len(volumes) >= 2  else None
        vol_ma25 = float(volumes.tail(25).mean()) if len(volumes) >= 10 else None
        volume_ratio_5d = (volume / vol_ma5) if (vol_ma5 and vol_ma5 > 0 and volume) else None

        # 売買代金系
        tv_ma5 = float(tv_series.tail(5).mean()) if len(tv_series) >= 2 else None
        trading_value_ratio_5d = (trading_value / tv_ma5) if (tv_ma5 and tv_ma5 > 0 and trading_value) else None

        # 20日高値
        high_20d   = float(highs.tail(20).max()) if len(highs) >= 2 else None
        high_breakout = 1 if (high_20d and high and high >= high_20d) else 0

        # 5日上昇傾向
        recent_closes = list(closes.tail(6).values)
        trend_5d = sum(1 for i in range(1, len(recent_closes)) if recent_closes[i] > recent_closes[i - 1])

        # 連続上昇日数（target_dateから遡って終値が連続で前日を上回っている日数）
        consecutive_up_days = _consecutive_up_days(closes)

        # 本日ストップ高（値幅制限の上限に達したか）
        is_stop_high = _is_stop_high(prev_close, close)

        def _r(v, n=2):
            return round(v, n) if v is not None else None

        records.append({
            "code":                    code,
            "date":                    target_date,
            "company_name":            today.get("company_name", ""),
            "close":                   close,
            "open":                    open_,
            "high":                    high,
            "low":                     low,
            "change_pct":              _r(change_pct),
            "volume":                  volume,
            "volume_ma5":              _r(vol_ma5, 0),
            "volume_ma25":             _r(vol_ma25, 0),
            "volume_ratio_5d":         _r(volume_ratio_5d),
            "trading_value":           _r(trading_value, 0),
            "trading_value_ma5":       _r(tv_ma5, 0),
            "trading_value_ratio_5d":  _r(trading_value_ratio_5d),
            "ma5":                     _r(ma5),
            "ma25":                    _r(ma25),
            "ma5_gap_pct":             _r(ma5_gap_pct),
            "ma25_gap_pct":            _r(ma25_gap_pct),
            "high_20d":                _r(high_20d),
            "high_breakout":           high_breakout,
            "trend_5d":                trend_5d,
            "consecutive_up_days":     consecutive_up_days,
            "is_stop_high":            is_stop_high,
        })

    return pd.DataFrame(records)


def _consecutive_up_days(closes: pd.Series) -> int:
    """target_date を含む終値系列から、末尾から遡って連続で前日比上昇している日数を返す"""
    vals = list(closes.values)
    count = 0
    for i in range(len(vals) - 1, 0, -1):
        if vals[i] > vals[i - 1]:
            count += 1
        else:
            break
    return count


# ── スコアリング ───────────────────────────────────────────────


def _score_technical(row: dict) -> float:
    """テクニカルスコア（最大25点）"""
    score = 0.0
    change = row.get("change_pct") or 0
    close  = row.get("close") or 0
    ma5    = row.get("ma5") or 0
    ma25   = row.get("ma25") or 0

    if change >= 5:
        score += 8
    elif change >= 3:
        score += 5

    if ma5 and close > ma5:
        score += 5

    if ma25 and close > ma25:
        score += 5

    if row.get("high_breakout"):
        score += 7

    return min(score, 25.0)


def _score_volume_flow(row: dict) -> float:
    """出来高・資金流入スコア（最大35点）"""
    score     = 0.0
    vol_ratio = row.get("volume_ratio_5d") or 0
    tv        = row.get("trading_value") or 0
    tv_ratio  = row.get("trading_value_ratio_5d") or 0

    if vol_ratio >= 3:
        score += 15
    elif vol_ratio >= 2:
        score += 10

    if tv >= 100_000_000:
        score += 10
    elif tv >= 50_000_000:
        score += 5

    if tv_ratio >= 2:
        score += 10

    return min(score, 35.0)


def _score_risk_penalty(row: dict) -> tuple[float, list[str]]:
    """
    過熱・連続上昇リスクによる減点（0以下）。
    翌営業日の値動きを検証した結果、当日の前日比が大きいほど翌日は下落しやすい
    傾向（負の相関）が確認されたため、過熱した銘柄ほど減点して的中率向上を図る。
    """
    change = row.get("change_pct") or 0
    streak = row.get("consecutive_up_days") or 0
    penalty = 0.0
    reasons: list[str] = []

    if change >= OVERHEAT_CHANGE_PCT_HIGH:
        penalty += OVERHEAT_PENALTY_HIGH
        reasons.append(f"前日比+{change:.1f}%は過熱気味のため減点")
    elif change >= OVERHEAT_CHANGE_PCT_MID:
        penalty += OVERHEAT_PENALTY_MID
        reasons.append(f"前日比+{change:.1f}%はやや過熱のため減点")

    if streak >= CONSECUTIVE_UP_DAYS_THRESHOLD:
        penalty += CONSECUTIVE_UP_DAYS_PENALTY
        reasons.append(f"{streak}日連続上昇のため減点")

    return penalty, reasons


def _score_market_sentiment(market_sentiment: str | None) -> tuple[float, list[str]]:
    """地合い（市場全体の前日比）によるスコア調整"""
    if market_sentiment == "悪い":
        return MARKET_SENTIMENT_BAD_PENALTY, ["地合いが悪いため減点"]
    if market_sentiment == "強い":
        return MARKET_SENTIMENT_STRONG_BONUS, ["地合いが強いため加点"]
    return 0.0, []


def _score_earnings(code: str) -> dict:
    """
    決算モメンタムスコア（最大90点、EDINET由来）を算出する。
    取得・解析に失敗した場合は fundamental_score.compute_fundamental_score() 側で
    必ず score=0 の辞書が返るため、ここで例外を捕捉する必要はない。
    """
    return compute_fundamental_score(code)


def _score_fundamental(data: dict | None) -> tuple[float, str]:
    """ファンダメンタルスコア（最大20点）。データなし時は (0, 'no_data')"""
    if not data:
        return 0.0, "no_data"

    score = 0.0
    per  = data.get("per")
    pbr  = data.get("pbr")
    roe  = data.get("roe")
    eq   = data.get("equity_ratio")
    opm  = data.get("operating_margin")

    if per and 0 < per <= 15:
        score += 4
    if pbr and 0 < pbr <= 1.5:
        score += 4
    if roe and roe >= 8:
        score += 4
    if eq and eq >= 40:
        score += 4
    if opm and opm >= 8:
        score += 4

    return min(score, 20.0), "available"


def _make_reason(row: dict) -> str:
    """ランキング表示用の選定理由を生成する"""
    parts = []
    change    = row.get("change_pct") or 0
    vol_ratio = row.get("volume_ratio_5d") or 0
    tv_ratio  = row.get("trading_value_ratio_5d") or 0
    close     = row.get("close") or 0
    ma25      = row.get("ma25") or 0
    ma5       = row.get("ma5") or 0

    if change >= 3:
        parts.append(f"+{change:.1f}%上昇")

    if vol_ratio >= 3:
        parts.append(f"出来高{vol_ratio:.1f}倍急増")
    elif vol_ratio >= 2:
        parts.append(f"出来高{vol_ratio:.1f}倍増")

    if row.get("high_breakout"):
        parts.append("20日高値更新")

    if tv_ratio >= 2:
        parts.append(f"売買代金{tv_ratio:.1f}倍増")

    if ma25 and close > ma25:
        parts.append("MA25↑")
    elif ma5 and close > ma5:
        parts.append("MA5↑")

    parts = parts[:4]

    if row.get("risk_penalty_reason"):
        parts.append(row["risk_penalty_reason"])
    if row.get("market_sentiment_reason"):
        parts.append(row["market_sentiment_reason"])

    return " / ".join(parts)


# ── フィルター ─────────────────────────────────────────────────


def _apply_filters(df: pd.DataFrame) -> pd.DataFrame:
    """スクリーニング条件でフィルタリング"""
    if df.empty:
        return df

    mask = (
        df["close"].between(MIN_PRICE, MAX_PRICE)
        & df["change_pct"].fillna(0).between(MIN_PRICE_CHANGE_PCT, MAX_PRICE_CHANGE_PCT)
        & (df["volume_ratio_5d"].fillna(0) >= MIN_VOLUME_RATIO)
        & (df["trading_value"].fillna(0) >= MIN_TURNOVER)
    )
    filtered = df[mask].copy()
    logger.info("フィルター後: %d 件", len(filtered))
    return filtered


# ── エントリーポイント ─────────────────────────────────────────


def run_analysis(target_date: str | None = None) -> pd.DataFrame:
    """
    分析を実行して注目銘柄 DataFrame を返す。
    target_date 未指定時は前日を対象にする。
    """
    if target_date is None:
        target_date = str(date.today() - timedelta(days=1))

    logger.info("分析開始: 対象日 = %s", target_date)

    # 1. データロード
    df_raw = _load_recent_quotes(target_date)
    if df_raw.empty:
        logger.warning("分析対象データが見つかりません（%s）", target_date)
        return pd.DataFrame()
    logger.info("ロード完了: %d 行", len(df_raw))

    fundamental_cache = _load_fundamental_cache()
    if not fundamental_cache:
        logger.info("ファンダメンタルデータなし: fundamental_score = 0 点で処理継続")

    market_sentiment_info = _load_market_sentiment(target_date)
    logger.info(
        "地合い判定: %s (主要4指数平均前日比 %s%%)",
        market_sentiment_info["market_sentiment"] or "判定不可",
        market_sentiment_info["market_change_pct"],
    )
    market_sentiment_score, market_sentiment_reasons = _score_market_sentiment(
        market_sentiment_info["market_sentiment"]
    )

    # 2. 特徴量計算
    df_feat = _compute_features(df_raw, target_date)
    logger.info("特徴量計算完了: %d 銘柄", len(df_feat))

    if df_feat.empty:
        return pd.DataFrame()

    # 3. テクニカル・出来高スコアリング・過熱/連続上昇リスク減点（全銘柄、外部APIを使わないため低コスト）
    rows = df_feat.to_dict("records")
    for row in rows:
        row["technical_score"] = _score_technical(row)
        row["volume_flow_score"] = _score_volume_flow(row)
        risk_penalty, risk_reasons = _score_risk_penalty(row)
        row["risk_penalty_score"] = risk_penalty
        row["risk_penalty_reason"] = "、".join(risk_reasons)
        row["market_sentiment"] = market_sentiment_info["market_sentiment"]
        row["market_change_pct"] = market_sentiment_info["market_change_pct"]

    df_scored = pd.DataFrame(rows)

    # 4. フィルター（EDINET決算モメンタムスコアはフィルター後の候補のみに絞って計算し、
    #    外部APIへのリクエスト数を抑える）
    df_filtered = _apply_filters(df_scored)
    if df_filtered.empty:
        logger.info("分析完了: 注目銘柄 0 件")
        return df_filtered

    # 5. 決算モメンタムスコア（EDINET）・ファンダメンタルスコアの付与
    filtered_rows = df_filtered.to_dict("records")
    for row in filtered_rows:
        code = row["code"]
        earnings_result = _score_earnings(code)
        fundamental_data = _get_fundamental_data(code, fundamental_cache)
        fds, f_st = _score_fundamental(fundamental_data)
        ems = earnings_result["score"]
        baseline_score = round(row["technical_score"] + row["volume_flow_score"], 2)
        total = round(
            baseline_score + fds
            + SCORE_WEIGHT_EARNINGS_MOMENTUM * ems
            + SCORE_WEIGHT_RISK_PENALTY * row["risk_penalty_score"]
            + SCORE_WEIGHT_MARKET_SENTIMENT * market_sentiment_score,
            2,
        )

        row.update({
            "baseline_score":          baseline_score,
            "earnings_momentum_score": ems,
            "fundamental_score":       fds,
            "market_sentiment_score":  market_sentiment_score,
            "market_sentiment_reason": "、".join(market_sentiment_reasons),
            "total_score":             total,
            "earnings_data_status":    "available" if ems else "no_data",
            "fundamental_data_status": f_st,
            "earnings_within_30d":     earnings_result["earnings_within_30d"],
            "upward_revision":         earnings_result["upward_revision"],
            "op_profit_growth_50":     earnings_result["op_profit_growth_50"],
            "dividend_increase":       earnings_result["dividend_increase"],
        })

    df_filtered = pd.DataFrame(filtered_rows)

    # 6. ランキング & 選定理由
    df_filtered = df_filtered.sort_values("total_score", ascending=False).reset_index(drop=True)
    df_filtered["rank"] = df_filtered.index + 1
    df_filtered["reason"] = df_filtered.apply(lambda r: _make_reason(r.to_dict()), axis=1)

    # 7. 本日ストップ高の翌日継続候補（スコアに依存しない別枠、rank=0で先頭掲載）。
    # ストップ高は前日比が抽出条件の上限（MAX_PRICE_CHANGE_PCT）を大きく超えるため、
    # 通常の候補（df_filtered）には含まれない df_feat（フィルター前の全銘柄）から探す。
    df_filtered["stop_high_pick"] = False
    stop_high_pick = _pick_stop_high_continuation_candidate(df_feat)
    if stop_high_pick is not None:
        df_filtered = df_filtered[df_filtered["code"] != stop_high_pick["code"]]
        df_filtered = pd.concat([pd.DataFrame([stop_high_pick]), df_filtered], ignore_index=True)
        logger.info("ストップ高翌日継続候補: %s (%s)", stop_high_pick["code"], stop_high_pick["company_name"])

    logger.info("分析完了: 注目銘柄 %d 件", len(df_filtered))
    return df_filtered


def _pick_stop_high_continuation_candidate(df_feat: pd.DataFrame) -> dict | None:
    """
    本日ストップ高だった銘柄の中から、翌日も継続しやすいと考えられる銘柄を1件選ぶ。
    選定基準: 出来高倍率(5日平均比)が高いほど需給が強く継続しやすいと考え、
    出来高倍率の降順、同率の場合は売買代金の降順で1件のみ選ぶ。
    ストップ高銘柄が存在しない場合は None を返す（ランキングには掲載しない）。
    スコアリング（total_score）には一切依存しない、別枠の注目株のため rank=0 とする。
    """
    candidates = df_feat[df_feat["is_stop_high"]].copy()
    if candidates.empty:
        return None

    candidates["volume_ratio_5d"] = candidates["volume_ratio_5d"].fillna(-1)
    candidates["trading_value"] = candidates["trading_value"].fillna(-1)
    candidates = candidates.sort_values(
        ["volume_ratio_5d", "trading_value"], ascending=[False, False]
    ).reset_index(drop=True)

    best = candidates.iloc[0].to_dict()
    vol_ratio = best.get("volume_ratio_5d")
    reason = "本日ストップ高"
    if vol_ratio and vol_ratio > 0:
        reason += f"（出来高{vol_ratio:.1f}倍）。翌日もストップ高が継続する可能性が高い注目株"
    else:
        reason += "。翌日もストップ高が継続する可能性が高い注目株"

    best.update({
        "rank": 0,
        "reason": reason,
        "stop_high_pick": True,
    })
    return best
