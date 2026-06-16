"""
指定銘柄の5分足データを yfinance から取得し DB に保存する。
また、エントリー価格に対する損益率を計算する。

この段階ではデイトレ判定（STAY/WATCH/TAKE_PROFIT/STOP_LOSS）も
LINE通知も行わない。
"""

import logging
from datetime import datetime

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

_INTERVAL = "5m"
_PERIOD = "1d"


def code_to_ticker(code: str) -> str:
    """4桁銘柄コードを yfinance ティッカーに変換する（例: "7203" → "7203.T"）"""
    return f"{code}.T"


def fetch_intraday_prices(codes: list[str]) -> dict[str, list[dict]]:
    """
    指定銘柄コードの当日5分足を取得する。

    返値は {code: [{datetime, open, high, low, close, volume}, ...]}
    （datetime 昇順）。取得に失敗した銘柄はキーに含まれないが、
    他の銘柄の処理は継続する。
    """
    result: dict[str, list[dict]] = {}

    for code in codes:
        ticker_symbol = code_to_ticker(code)
        try:
            hist = yf.Ticker(ticker_symbol).history(period=_PERIOD, interval=_INTERVAL)
        except Exception as e:
            logger.error("銘柄 %s: 5分足取得失敗: %s", code, e)
            continue

        if hist.empty:
            logger.warning("銘柄 %s: 5分足データがありません。スキップ", code)
            continue

        records = []
        for dt, row in hist.iterrows():
            close = _safe_float(row.get("Close"))
            if close is None or pd.isna(close):
                continue
            records.append({
                "datetime": dt.strftime("%Y-%m-%d %H:%M:%S"),
                "open":     _safe_float(row.get("Open")),
                "high":     _safe_float(row.get("High")),
                "low":      _safe_float(row.get("Low")),
                "close":    close,
                "volume":   _safe_float(row.get("Volume")),
            })

        if records:
            result[code] = records
            logger.info("銘柄 %s: 5分足 %d 件取得", code, len(records))
        else:
            logger.warning("銘柄 %s: 有効な5分足データがありませんでした。スキップ", code)

    return result


def run_intraday_fetch(codes: list[str]) -> pd.DataFrame:
    """
    5分足取得 → DB保存 を行い、保存した全データを DataFrame で返す。
    """
    from db import upsert_intraday_prices

    quotes = fetch_intraday_prices(codes)
    if not quotes:
        logger.warning("5分足データを取得できた銘柄がありませんでした。")
        return pd.DataFrame()

    all_rows = []
    for code, records in quotes.items():
        upsert_intraday_prices(code, records)
        for r in records:
            all_rows.append({"code": code, **r})

    return pd.DataFrame(all_rows)


def run_intraday_positions(df_prices: pd.DataFrame, entry_mode: str) -> pd.DataFrame:
    """
    取得済みの5分足データ（run_intraday_fetch の返値）から
    エントリー価格決定 → 損益率計算を行う。
    結果は intraday_positions テーブルに保存され、DataFrame で返される。
    """
    from db import upsert_intraday_positions
    from entry_price import get_entry_prices

    if df_prices.empty:
        return pd.DataFrame()

    df_sorted = df_prices.sort_values("datetime")
    first_closes   = df_sorted.groupby("code")["close"].first().to_dict()
    current_prices = df_sorted.groupby("code")["close"].last().to_dict()

    codes_with_data = list(current_prices.keys())
    entry_prices = get_entry_prices(codes_with_data, entry_mode, first_closes)

    calculated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    positions = []
    for code in codes_with_data:
        entry_price = entry_prices.get(code)
        if not entry_price:
            logger.info("銘柄 %s: エントリー価格が未設定のためスキップ", code)
            continue

        current_price = current_prices[code]
        profit_pct = (current_price - entry_price) / entry_price * 100

        positions.append({
            "code":          code,
            "entry_price":   entry_price,
            "current_price": current_price,
            "profit_pct":    round(profit_pct, 2),
            "entry_mode":    entry_mode,
            "calculated_at": calculated_at,
        })

    if positions:
        upsert_intraday_positions(positions)
        logger.info("損益計算完了: %d 銘柄", len(positions))

    return pd.DataFrame(positions)


def fetch_previous_day_ohlc(code: str) -> dict | None:
    """
    指定銘柄の前営業日の high/low/close を返す。
    1. yfinance の日足から取得
    2. 失敗・データなしの場合は daily_quotes テーブルから取得
    3. それでも取得できない場合は None（呼び出し側で判定をスキップする）
    """
    from datetime import date

    ticker_symbol = code_to_ticker(code)
    try:
        hist = yf.Ticker(ticker_symbol).history(period="5d", interval="1d")
        if not hist.empty:
            today = date.today()
            hist = hist[hist.index.date < today]
            if not hist.empty:
                row = hist.iloc[-1]
                high  = _safe_float(row.get("High"))
                low   = _safe_float(row.get("Low"))
                close = _safe_float(row.get("Close"))
                if high is not None and low is not None and close is not None:
                    return {"high": high, "low": low, "close": close}
    except Exception as e:
        logger.warning("銘柄 %s: yfinance前日OHLC取得失敗: %s", code, e)

    from db import get_previous_daily_quote
    row = get_previous_daily_quote(code)
    if row and row.get("high") is not None and row.get("low") is not None and row.get("close") is not None:
        logger.info("銘柄 %s: 前日OHLCをdaily_quotesから取得", code)
        return {"high": row["high"], "low": row["low"], "close": row["close"]}

    logger.warning("銘柄 %s: 前日OHLCを取得できませんでした。前日高値・安値の判定をスキップします", code)
    return None


def fetch_previous_day_ohlc_for_codes(codes: list[str]) -> dict[str, dict | None]:
    """複数銘柄分の前日OHLCを一括取得する"""
    return {code: fetch_previous_day_ohlc(code) for code in codes}


def _safe_float(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None
