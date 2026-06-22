"""
yfinance を使って日本株の株価と市場指数を取得する。
"""

import logging
import re
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

from config import MARKET_SYMBOLS

logger = logging.getLogger(__name__)

_BATCH_SIZE = 200       # レート制限対策で小さめに
_BATCH_DELAY = 5        # バッチ間の待機秒数
_RATE_LIMIT_WAIT = 60   # レート制限時の待機秒数

_ALNUM_CODE_RE = re.compile(r"^[0-9A-Za-z]{4}$")


# ── 日本株一括取得 ────────────────────────────────────────────


def fetch_japanese_stocks_from_yfinance(codes: list[str], period: str = "30d") -> list[dict]:
    """
    日本株コードリスト（例: ["72030", "67580"] または ["7203", "6758"]）の株価を
    yfinance で取得する。

    J-Quants の5桁コード（末尾0）は4桁に変換して "XXXX.T" 形式で渡す。
    _BATCH_SIZE 件ずつ分割し、バッチ間に遅延を挿入してレート制限を回避する。
    返値は DB の daily_quotes スキーマに合わせた辞書リスト。
    """
    # コードを (J-Quantsコード, yfinanceティッカー) のペアに変換
    ticker_pairs: list[tuple[str, str]] = []
    for code in codes:
        ticker = _to_yfinance_ticker(code)
        if ticker:
            ticker_pairs.append((code, ticker))

    logger.info("日本株: %d件 → yfinance変換後 %d件", len(codes), len(ticker_pairs))

    all_results: list[dict] = []
    total_batches = (len(ticker_pairs) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for batch_idx in range(0, len(ticker_pairs), _BATCH_SIZE):
        if batch_idx > 0:
            time.sleep(_BATCH_DELAY)

        batch_pairs = ticker_pairs[batch_idx:batch_idx + _BATCH_SIZE]
        batch_codes   = [p[0] for p in batch_pairs]
        batch_tickers = [p[1] for p in batch_pairs]
        batch_num = batch_idx // _BATCH_SIZE + 1

        logger.info("日本株取得: バッチ %d/%d (%d銘柄)", batch_num, total_batches, len(batch_pairs))

        records = _download_batch(batch_tickers, batch_codes, period, batch_num, total_batches)
        all_results.extend(records)

    logger.info("日本株取得完了: 合計 %d 件", len(all_results))
    return all_results


def _to_yfinance_ticker(code: str) -> str | None:
    """
    J-Quants コードを yfinance ティッカーに変換する。
    J-Quants は英字を含む新形式コードも含め、全銘柄を5桁（末尾0埋め）で返すため、
    5桁末尾0のパディングは数字限定にせず判定する。
    - 5桁で末尾0:  "XXXXX0" → "XXXX.T"（先頭4桁が英数字4桁コードなら変換）
    - 4桁の英数字: "XXXX"   → "XXXX.T"
    - その他: None（スキップ）
    """
    if len(code) == 5 and code.endswith("0") and _ALNUM_CODE_RE.match(code[:4]):
        return f"{code[:4]}.T"
    if _ALNUM_CODE_RE.match(code):
        return f"{code}.T"
    return None


def _download_batch(
    tickers: list[str],
    codes: list[str],
    period: str,
    batch_num: int,
    total_batches: int,
) -> list[dict]:
    """1バッチ分のダウンロード。レート制限時は1回リトライする。"""
    for attempt in (1, 2):
        try:
            df = yf.download(
                tickers,
                period=period,
                auto_adjust=False,
                progress=False,
                threads=True,
            )
            if df.empty:
                logger.warning("バッチ %d/%d: データなし", batch_num, total_batches)
                return []

            records = _parse_download_df(df, tickers, codes)
            logger.info("バッチ %d/%d: %d件取得", batch_num, total_batches, len(records))
            return records

        except Exception as e:
            if "rate" in str(e).lower() or "429" in str(e) or "too many" in str(e).lower():
                if attempt == 1:
                    logger.warning("バッチ %d/%d: レート制限。%d秒待機後リトライ...",
                                   batch_num, total_batches, _RATE_LIMIT_WAIT)
                    time.sleep(_RATE_LIMIT_WAIT)
                else:
                    logger.error("バッチ %d/%d: レート制限リトライ失敗", batch_num, total_batches)
            else:
                logger.error("バッチ %d/%d 失敗: %s", batch_num, total_batches, e)
                break

    return []


def _parse_download_df(df: pd.DataFrame, tickers: list[str], codes: list[str]) -> list[dict]:
    """
    yf.download の MultiIndex DataFrame（Price × Ticker）を
    DB の daily_quotes スキーマに合う辞書リストに変換する。
    """
    results: list[dict] = []
    # tickers が1件の場合、yf.download は列がMultiIndexにならず単純な列名になる。
    # その場合は is_multiindex=False の分岐（elif "Close" not in df.columns）で判定する。
    is_multiindex = isinstance(df.columns, pd.MultiIndex)

    for ticker, code in zip(tickers, codes):
        if is_multiindex:
            if ("Close", ticker) not in df.columns:
                continue
        elif "Close" not in df.columns:
            continue
        try:
            # ticker 軸をクロスセクションで取り出す（単一銘柄の場合はdfそのものを使う）
            sub = df.xs(ticker, axis=1, level=1) if is_multiindex else df

            for dt, row in sub.iterrows():
                close = _safe_float(row.get("Close"))
                if close is None or pd.isna(close):
                    continue
                volume = _safe_float(row.get("Volume"))
                turnover = round(close * volume) if (close and volume) else None

                results.append({
                    "Date":             str(dt.date()),
                    "Code":             code,
                    "Open":             _safe_float(row.get("Open")),
                    "High":             _safe_float(row.get("High")),
                    "Low":              _safe_float(row.get("Low")),
                    "Close":            close,
                    "UpperLimit":       None,
                    "LowerLimit":       None,
                    "Volume":           volume,
                    "TurnoverValue":    turnover,
                    "AdjustmentFactor": None,
                    "AdjustmentOpen":   None,
                    "AdjustmentHigh":   None,
                    "AdjustmentLow":    None,
                    "AdjustmentClose":  _safe_float(row.get("Adj Close")),
                    "AdjustmentVolume": None,
                })
        except Exception as e:
            logger.debug("銘柄 %s 整形スキップ: %s", ticker, e)

    return results


# ── 市場指数取得 ──────────────────────────────────────────────


def fetch_market_indices(days: int = 5) -> list[dict]:
    """
    MARKET_SYMBOLS を直近 days 日分取得して DB 保存用の辞書リストを返す。
    取得失敗したシンボルはスキップしてログ出力する。
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days + 7)

    results: list[dict] = []

    for symbol, label in MARKET_SYMBOLS.items():
        try:
            logger.info("yfinance: %s (%s) 取得中...", symbol, label)
            ticker = yf.Ticker(symbol)
            hist = ticker.history(start=str(start_date), end=str(end_date))

            if hist.empty:
                logger.warning("yfinance: %s のデータが空でした", symbol)
                continue

            for idx_date, row in hist.iterrows():
                results.append({
                    "symbol": symbol,
                    "date":   str(idx_date.date()),
                    "open":   _safe_float(row.get("Open")),
                    "high":   _safe_float(row.get("High")),
                    "low":    _safe_float(row.get("Low")),
                    "close":  _safe_float(row.get("Close")),
                    "volume": _safe_float(row.get("Volume")),
                })

        except Exception as e:
            logger.error("yfinance: %s の取得に失敗: %s", symbol, e)

    logger.info("市場指数: 合計 %d 件取得", len(results))
    return results


def get_latest_index_summary() -> dict:
    """各指数の直近終値を {symbol: close} の形式で返す（スコアリング補正用）"""
    summary: dict[str, float] = {}
    for symbol in MARKET_SYMBOLS:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="2d")
            if not hist.empty:
                summary[symbol] = float(hist["Close"].iloc[-1])
        except Exception as e:
            logger.warning("指数サマリー取得失敗 %s: %s", symbol, e)
    return summary


# ── 市場環境（地合い）判定 ────────────────────────────────────

# 地合い判定に使う指数（USDJPY=X, BTC-USD は market_indices への保存のみ行い、判定には使わない）
_SENTIMENT_SYMBOLS = ["^N225", "1306.T", "^IXIC", "^GSPC"]
_SENTIMENT_STRONG_PCT = 1.0
_SENTIMENT_WEAK_PCT = -1.0


def fetch_market_snapshot() -> dict[str, dict]:
    """
    MARKET_SYMBOLS（日経平均・TOPIX・NASDAQ・S&P500・ドル円・BTC）の直近の
    OHLCVと前日比(%)を取得する。取得に失敗したシンボルはキーに含まれない。

    返値: {symbol: {date, open, high, low, close, volume, change_pct}}
    """
    snapshot: dict[str, dict] = {}

    for symbol in MARKET_SYMBOLS:
        try:
            hist = yf.Ticker(symbol).history(period="5d").dropna(subset=["Close"])
            if hist.empty:
                logger.warning("yfinance: %s のデータが空でした", symbol)
                continue

            latest = hist.iloc[-1]
            change_pct = None
            if len(hist) >= 2:
                prev_close = float(hist["Close"].iloc[-2])
                if prev_close:
                    change_pct = round((float(latest["Close"]) - prev_close) / prev_close * 100, 2)

            snapshot[symbol] = {
                "date":       str(hist.index[-1].date()),
                "open":       _safe_float(latest.get("Open")),
                "high":       _safe_float(latest.get("High")),
                "low":        _safe_float(latest.get("Low")),
                "close":      _safe_float(latest.get("Close")),
                "volume":     _safe_float(latest.get("Volume")),
                "change_pct": change_pct,
            }
        except Exception as e:
            logger.warning("yfinance: %s の市場スナップショット取得に失敗: %s", symbol, e)

    return snapshot


def classify_market_sentiment(snapshot: dict[str, dict]) -> dict:
    """
    日経平均・TOPIX・NASDAQ・S&P500 の前日比(%)の単純平均から地合いを判定する。
    +1.0%以上: 強い / -1.0%以下: 悪い / それ以外: 普通。
    対象指数が1つも取得できていない場合は判定不可として None を返す。
    """
    values = [
        snapshot[sym]["change_pct"]
        for sym in _SENTIMENT_SYMBOLS
        if sym in snapshot and snapshot[sym].get("change_pct") is not None
    ]
    if not values:
        return {"market_sentiment": None, "market_change_pct": None}

    avg = sum(values) / len(values)
    if avg >= _SENTIMENT_STRONG_PCT:
        sentiment = "強い"
    elif avg <= _SENTIMENT_WEAK_PCT:
        sentiment = "悪い"
    else:
        sentiment = "普通"

    return {"market_sentiment": sentiment, "market_change_pct": round(avg, 2)}


# ── ユーティリティ ────────────────────────────────────────────


def _safe_float(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None
