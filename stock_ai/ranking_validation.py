"""
前日の注目銘柄ランキングが翌営業日に有効だったかを検証する。

analysis_results の指定日のランキング銘柄について、翌営業日の株価推移
（始値・高値・安値・終値・出来高）を取得し、ランキングが注目銘柄として
妥当だったかを HIT/GOOD/OK/BAD/NEUTRAL で評価する。

既存の注目銘柄ランキング抽出・通知機能（analyze.py / ranking_notifier.py）
とは独立したフローで、それらの動作は変更しない。自動売買は行わない。
"""

import logging
import sqlite3
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

from config import DB_PATH
from fetch_yfinance import _to_yfinance_ticker

logger = logging.getLogger(__name__)

_AVG_VOLUME_DAYS = 5


def _is_closed(d: date) -> bool:
    try:
        import jpholiday
        return d.weekday() >= 5 or jpholiday.is_holiday(d)
    except ImportError:
        return d.weekday() >= 5  # jpholiday 未インストール時は土日のみ


def next_business_day(d: date) -> date:
    """指定日の翌営業日（土日・日本の祝日を除く）を返す"""
    nxt = d + timedelta(days=1)
    while _is_closed(nxt):
        nxt += timedelta(days=1)
    return nxt


_SCORE_BREAKDOWN_COLS = [
    "baseline_score", "technical_score", "volume_flow_score", "earnings_momentum_score", "fundamental_score",
    "risk_penalty_score", "market_sentiment_score", "consecutive_up_days", "change_pct",
    "earnings_within_30d", "upward_revision", "op_profit_growth_50", "dividend_increase",
]


def get_ranking_for_date(target_date: str) -> pd.DataFrame:
    """analysis_results から指定日のランキング（全件、スコア内訳付き）を順位順で返す"""
    conn = sqlite3.connect(DB_PATH)
    cols = ", ".join(_SCORE_BREAKDOWN_COLS)
    df = pd.read_sql_query(
        f"""
        SELECT rank, code, company_name, total_score, {cols}
        FROM analysis_results
        WHERE date = ?
        ORDER BY rank ASC
        """,
        conn, params=(target_date,),
    )
    conn.close()
    return df


def _get_quote_from_db(code: str, quote_date: str) -> dict | None:
    """daily_quotes から該当日のOHLCVを取得する（4桁/5桁コード両対応）。なければ None"""
    code_5digit = f"{code}0" if len(code) == 4 else code
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(
        "SELECT open, high, low, close, volume FROM daily_quotes WHERE code IN (?, ?) AND date = ?",
        (code, code_5digit, quote_date),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def _get_quote_from_yfinance(code: str, quote_date: str) -> dict | None:
    """daily_quotes に該当日のデータがない場合、yfinance から直接取得する。取得できなければ None"""
    ticker_symbol = _to_yfinance_ticker(code)
    if ticker_symbol is None:
        return None
    try:
        d = date.fromisoformat(quote_date)
        hist = yf.Ticker(ticker_symbol).history(start=str(d), end=str(d + timedelta(days=1)))
        if hist.empty:
            return None
        row = hist.iloc[0]
        return {
            "open":   float(row["Open"]),
            "high":   float(row["High"]),
            "low":    float(row["Low"]),
            "close":  float(row["Close"]),
            "volume": float(row["Volume"]),
        }
    except Exception as e:
        logger.warning("銘柄 %s: yfinance取得失敗 (%s): %s", code, quote_date, e)
        return None


def _get_first_close_entry(code: str, next_date: str) -> float | None:
    """
    intraday_prices に next_date の5分足データがあれば、当日最初の5分足終値を返す
    （main.py の entry_mode="first_close" と同じ定義）。
    intraday_prices.code は4桁表記（watchlist/--intraday と同じ）のため5桁→4桁変換も試す。
    データが無ければ None（呼び出し元は daily_quotes の始値にフォールバックする）。
    """
    code_4digit = code[:-1] if len(code) == 5 and code.endswith("0") else code
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query(
            "SELECT close FROM intraday_prices WHERE code IN (?, ?) AND datetime LIKE ? "
            "ORDER BY datetime LIMIT 1",
            conn, params=(code, code_4digit, f"{next_date}%"),
        )
    except Exception:
        return None
    finally:
        conn.close()
    if df.empty or pd.isna(df.iloc[0]["close"]):
        return None
    return float(df.iloc[0]["close"])


def _get_avg_volume(code: str, before_date: str) -> float | None:
    """volume_ratio 算出用に、before_date より前の直近 _AVG_VOLUME_DAYS 日平均出来高を返す"""
    code_5digit = f"{code}0" if len(code) == 4 else code
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT volume FROM daily_quotes
        WHERE code IN (?, ?) AND date < ? AND volume IS NOT NULL
        ORDER BY date DESC LIMIT ?
        """,
        conn, params=(code, code_5digit, before_date, _AVG_VOLUME_DAYS),
    )
    conn.close()
    if df.empty:
        return None
    return float(df["volume"].mean())


def _classify(max_gain_pct: float, max_drawdown_pct: float, close_return_pct: float) -> str:
    """HIT > GOOD > OK > BAD > NEUTRAL の優先順位で検証結果を判定する"""
    if max_gain_pct >= 5:
        return "HIT"
    if max_gain_pct >= 3:
        return "GOOD"
    if close_return_pct > 0:
        return "OK"
    if max_drawdown_pct <= -3:
        return "BAD"
    return "NEUTRAL"


def validate_ranking(target_date: str) -> pd.DataFrame:
    """
    target_date の注目銘柄ランキングについて、翌営業日の株価推移を検証する。
    daily_quotes に翌営業日のデータがあればそれを使い、なければ yfinance から
    直接取得する。yfinance でも取得できない銘柄はスキップする。

    エントリー価格は、intraday_prices に当日5分足データがあれば「最初の5分足終値」
    （main.py の entry_mode="first_close" と同じ定義）を使い、無ければ daily_quotes の
    始値で代替する（entry_price_source 列でどちらを使ったか分かる）。5分足データは
    watchlist/--intraday の対象銘柄（最大5件）のみ存在するため、大多数の銘柄は
    日次始値ベースのままになる点に注意。
    """
    df_ranking = get_ranking_for_date(target_date)
    if df_ranking.empty:
        logger.warning("analysis_results にデータがありません: %s", target_date)
        return pd.DataFrame()

    next_date = str(next_business_day(date.fromisoformat(target_date)))
    logger.info("ランキング検証: 対象日=%s, 翌営業日=%s, %d 銘柄", target_date, next_date, len(df_ranking))

    rows = []
    for _, r in df_ranking.iterrows():
        code = str(r["code"])

        quote = _get_quote_from_db(code, next_date) or _get_quote_from_yfinance(code, next_date)
        if not quote or not quote.get("open"):
            logger.info("銘柄 %s: 翌営業日(%s)の株価データが取得できないためスキップ", code, next_date)
            continue

        next_open  = quote["open"]
        next_high  = quote["high"]
        next_low   = quote["low"]
        next_close = quote["close"]
        next_volume = quote.get("volume")

        # intraday_prices に当日5分足データがあれば「最初の5分足終値」をエントリー価格として使う
        # （main.py の entry_mode="first_close" と同じ定義、より実運用に近い）。
        # 5分足データが無い大多数の銘柄（watchlist/--intraday 対象外）は daily_quotes の始値で代替する。
        first_close_entry = _get_first_close_entry(code, next_date)
        if first_close_entry:
            entry_price = first_close_entry
            entry_price_source = "5分足終値（最初の5分足）"
        else:
            entry_price = next_open
            entry_price_source = "日次始値"

        max_gain_pct     = round((next_high - entry_price) / entry_price * 100, 2)
        max_drawdown_pct = round((next_low - entry_price) / entry_price * 100, 2)
        close_return_pct = round((next_close - entry_price) / entry_price * 100, 2)

        avg_volume = _get_avg_volume(code, next_date)
        volume_ratio = round(next_volume / avg_volume, 2) if (avg_volume and next_volume) else None

        row = {
            "rank":              r.get("rank"),
            "code":              code,
            "entry_price":       round(float(entry_price), 2),
            "entry_price_source": entry_price_source,
            "company_name":      r.get("company_name"),
            "total_score":       r.get("total_score"),
            "next_open":         round(float(next_open), 2),
            "next_high":         round(float(next_high), 2),
            "next_low":          round(float(next_low), 2),
            "next_close":        round(float(next_close), 2),
            "max_gain_pct":      max_gain_pct,
            "max_drawdown_pct":  max_drawdown_pct,
            "close_return_pct":  close_return_pct,
            "volume_ratio":      volume_ratio,
            "validation_result": _classify(max_gain_pct, max_drawdown_pct, close_return_pct),
        }
        for col in _SCORE_BREAKDOWN_COLS:
            row[col] = r.get(col)
        rows.append(row)

    df_result = pd.DataFrame(rows)
    logger.info("ランキング検証完了: %d / %d 銘柄", len(df_result), len(df_ranking))
    return df_result


# ── スコア要素の有効性分析 ─────────────────────────────────────────


def correlation_summary(df_validation: pd.DataFrame, target_col: str = "close_return_pct") -> pd.Series:
    """
    各スコア要素（technical_score / earnings_momentum_score 等）と翌営業日リターンとの
    相関係数を降順で返す。決算モメンタムスコアなど個別要素が実際に効いているかを
    定量的に確認するために使う（正の相関が強いほど「翌日上昇」との結びつきが強い）。
    """
    if df_validation.empty:
        return pd.Series(dtype=float)

    candidate_cols = [c for c in [*_SCORE_BREAKDOWN_COLS, "total_score"] if c in df_validation.columns]
    numeric_df = df_validation[[*candidate_cols, target_col]].apply(pd.to_numeric, errors="coerce")
    corr = numeric_df.corr()[target_col].drop(target_col, errors="ignore")
    return corr.dropna().sort_values(ascending=False)


def summarize_by_score_band(df_validation: pd.DataFrame, score_col: str) -> pd.DataFrame:
    """
    指定スコア列の値帯ごとに件数・平均リターン・HIT率・GOOD以上率・BAD率を集計する。
    決算モメンタムスコア等のスコア要素について「高いほど的中率が上がるか」を
    視覚的に確認するために使う。
    """
    if df_validation.empty or score_col not in df_validation.columns:
        return pd.DataFrame()

    values = pd.to_numeric(df_validation[score_col], errors="coerce")
    if values.dropna().empty:
        return pd.DataFrame()

    uniques = sorted(values.dropna().unique())
    if len(uniques) <= 6:
        band = values.map(lambda v: v if pd.notna(v) else None).astype("object")
    else:
        band = pd.qcut(values, q=4, duplicates="drop")

    df = df_validation.copy()
    df["_band"] = band
    summary = df.groupby("_band", dropna=True).agg(
        件数=("code", "count"),
        平均リターン=("close_return_pct", "mean"),
        HIT率=("validation_result", lambda s: (s == "HIT").mean() * 100),
        GOOD以上率=("validation_result", lambda s: s.isin(["HIT", "GOOD"]).mean() * 100),
        BAD率=("validation_result", lambda s: (s == "BAD").mean() * 100),
    ).round(2)
    return summary.reset_index().rename(columns={"_band": score_col})


# ── 複数日まとめ検証 ────────────────────────────────────────────


def get_available_ranking_dates() -> list[str]:
    """analysis_results に存在するランキング日付の一覧を昇順で返す"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT DISTINCT date FROM analysis_results ORDER BY date", conn)
    conn.close()
    return df["date"].tolist()


def validate_ranking_range(start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
    """
    analysis_results に存在する複数日分のランキングをまとめて検証する。
    start_date / end_date 省略時はそれぞれ最古日・最新日まで対象とする。
    各行に ranking_date 列を追加して全日分を結合した DataFrame を返す
    （翌営業日データが無い日はスキップされ、結果に含まれない）。
    """
    dates = get_available_ranking_dates()
    if start_date:
        dates = [d for d in dates if d >= start_date]
    if end_date:
        dates = [d for d in dates if d <= end_date]

    if not dates:
        logger.warning("検証対象のランキング日付がありません。")
        return pd.DataFrame()

    frames = []
    for d in dates:
        try:
            df_day = validate_ranking(d)
        except Exception as e:
            logger.warning("ランキング検証エラー (%s): %s", d, e)
            continue
        if df_day.empty:
            continue
        df_day = df_day.copy()
        df_day.insert(0, "ranking_date", d)
        frames.append(df_day)

    if not frames:
        return pd.DataFrame()

    df_all = pd.concat(frames, ignore_index=True)
    logger.info("複数日ランキング検証完了: %d 日分, 合計 %d 銘柄", len(frames), len(df_all))
    return df_all
