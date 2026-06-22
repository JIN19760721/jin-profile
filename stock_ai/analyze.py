"""
注目銘柄の分析ロジック。

スコア構成（合計100点）:
  テクニカル          25点
  出来高・資金流入    35点
  決算モメンタム      20点  ← データなし時 0点
  ファンダメンタル    20点  ← データなし時 0点
"""

import logging
import sqlite3
from datetime import date, timedelta

import pandas as pd

from config import (
    DB_PATH,
    MAX_PRICE,
    MIN_PRICE,
    MIN_PRICE_CHANGE_PCT,
    MIN_TURNOVER,
    MIN_VOLUME_RATIO,
)
from fundamental_score import compute_fundamental_score

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
        })

    return pd.DataFrame(records)


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


def _score_earnings(code: str) -> dict:
    """
    決算モメンタムスコア（最大90点、EDINET由来）を算出する。
    取得・解析に失敗した場合は fundamental_score.compute_fundamental_score() 側で
    必ず score=0 の辞書が返るため、ここで例外を捕捉する必要はない。
    """
    return compute_fundamental_score(code)


def _score_fundamental(code: str, cache: dict) -> tuple[float, str]:
    """ファンダメンタルスコア（最大20点）。データなし時は (0, 'no_data')"""
    data = cache.get(code)
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

    return " / ".join(parts[:4])


# ── フィルター ─────────────────────────────────────────────────


def _apply_filters(df: pd.DataFrame) -> pd.DataFrame:
    """スクリーニング条件でフィルタリング"""
    if df.empty:
        return df

    mask = (
        df["close"].between(MIN_PRICE, MAX_PRICE)
        & (df["change_pct"].fillna(0) >= MIN_PRICE_CHANGE_PCT)
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

    # 2. 特徴量計算
    df_feat = _compute_features(df_raw, target_date)
    logger.info("特徴量計算完了: %d 銘柄", len(df_feat))

    if df_feat.empty:
        return pd.DataFrame()

    # 3. テクニカル・出来高スコアリング（全銘柄、外部APIを使わないため低コスト）
    rows = df_feat.to_dict("records")
    for row in rows:
        row["technical_score"] = _score_technical(row)
        row["volume_flow_score"] = _score_volume_flow(row)

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
        fds, f_st = _score_fundamental(code, fundamental_cache)
        ems = earnings_result["score"]
        total = round(row["technical_score"] + row["volume_flow_score"] + ems + fds, 2)

        row.update({
            "earnings_momentum_score": ems,
            "fundamental_score":       fds,
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

    logger.info("分析完了: 注目銘柄 %d 件", len(df_filtered))
    return df_filtered
