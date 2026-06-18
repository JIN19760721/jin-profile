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


def get_ranking_for_date(target_date: str) -> pd.DataFrame:
    """analysis_results から指定日のランキング（全件）を順位順で返す"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT rank, code, company_name, total_score
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

        max_gain_pct     = round((next_high - next_open) / next_open * 100, 2)
        max_drawdown_pct = round((next_low - next_open) / next_open * 100, 2)
        close_return_pct = round((next_close - next_open) / next_open * 100, 2)

        avg_volume = _get_avg_volume(code, next_date)
        volume_ratio = round(next_volume / avg_volume, 2) if (avg_volume and next_volume) else None

        rows.append({
            "rank":              r.get("rank"),
            "code":              code,
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
        })

    df_result = pd.DataFrame(rows)
    logger.info("ランキング検証完了: %d / %d 銘柄", len(df_result), len(df_ranking))
    return df_result
