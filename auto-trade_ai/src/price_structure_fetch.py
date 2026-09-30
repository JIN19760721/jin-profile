"""
V2設計書 Phase1（Shadow Mode）: trade_plan計算用の補助データ取得。

src/entry_policy.py の _check_hourly_uptrend と同じ方針:
kabuステーションには分足/日足の過去データAPIがないため yfinance を使う。
全関数フェイルオープン（失敗時は None を返しログ警告のみ）、
候補評価tickごとの過剰通信を防ぐため短時間TTLキャッシュを持つ。

観測専用。ここで取得した値は trade_plan.py 経由で記録されるだけで、
経路Dの実際の売買判定には一切接続しない。
"""

from __future__ import annotations

import logging
import time

import pandas as pd
import yfinance as yf

from src.config import RR_SWING_LOOKBACK_BARS

log = logging.getLogger(__name__)

_CACHE_TTL_SEC = 300  # 5分（entry_policy._UPTREND_CACHE_TTL_SECと同じ方針）

_swing_cache: dict[str, tuple[float, float | None, float | None]] = {}
_prev_day_high_cache: dict[str, tuple[float, float | None]] = {}
_atr_cache: dict[str, tuple[float, float | None]] = {}


def _yf_symbol(symbol: str) -> str:
    return f"{symbol}.T"


def get_swing_low_high(symbol: str) -> tuple[float | None, float | None]:
    """当日5分足、直近N本のLow最小値/High最大値を返す。（失敗時は None, None）"""
    cached = _swing_cache.get(symbol)
    now = time.monotonic()
    if cached is not None and (now - cached[0]) < _CACHE_TTL_SEC:
        return cached[1], cached[2]

    low, high = None, None
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="5m", period="1d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is not None and len(df) > 0:
            recent = df.tail(RR_SWING_LOOKBACK_BARS)
            low = float(recent["Low"].min())
            high = float(recent["High"].max())
    except Exception as e:
        log.warning("swing_low_high取得失敗 %s: %s", symbol, e)

    _swing_cache[symbol] = (now, low, high)
    return low, high


def get_prev_day_high(symbol: str) -> float | None:
    """直近の完了済み取引日（当日を除く）の高値を返す。（失敗時は None）"""
    cached = _prev_day_high_cache.get(symbol)
    now = time.monotonic()
    if cached is not None and (now - cached[0]) < _CACHE_TTL_SEC:
        return cached[1]

    prev_high = None
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1d", period="10d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is not None and len(df) >= 2:
            # 最終行が当日（取引時間中は未確定）の可能性があるため、
            # 当日を除いた直近の完了済み行を使う。
            prev_high = float(df["High"].iloc[-2])
    except Exception as e:
        log.warning("prev_day_high取得失敗 %s: %s", symbol, e)

    _prev_day_high_cache[symbol] = (now, prev_high)
    return prev_high


def _calc_atr(df: pd.DataFrame, period: int) -> float | None:
    if df is None or len(df) < period + 1:
        return None
    high = df["High"]
    low = df["Low"]
    prev_close = df["Close"].shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1,
    ).max(axis=1)
    atr = tr.rolling(period).mean().iloc[-1]
    if pd.isna(atr):
        return None
    return float(atr)


def get_atr(symbol: str, period: int = 14) -> float | None:
    """日足ベースのATR(period)を返す。（データ不足・失敗時は None）"""
    cached = _atr_cache.get(symbol)
    now = time.monotonic()
    if cached is not None and (now - cached[0]) < _CACHE_TTL_SEC:
        return cached[1]

    atr = None
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1d", period=f"{period + 10}d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        atr = _calc_atr(df, period)
    except Exception as e:
        log.warning("ATR取得失敗 %s: %s", symbol, e)

    _atr_cache[symbol] = (now, atr)
    return atr


def clear_cache() -> None:
    """テスト用: 全キャッシュをリセットする。"""
    _swing_cache.clear()
    _prev_day_high_cache.clear()
    _atr_cache.clear()
