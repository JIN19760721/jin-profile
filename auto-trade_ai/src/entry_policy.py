"""
エントリーポリシー判定（3条件すべて AND）。

① 1時間足が上昇トレンド: MA5(1H) > MA20(1H) かつ MA5 の傾きが正
② 1分足の移動平均が上昇: MA5(1M) の最新値 > 1本前
③ RCI(9) が -80 以下に接近後、反転上昇中

データソース: yfinance（kabu station には分足/時間足の過去データAPIがないため）
"""

import logging
import time

import pandas as pd
import yfinance as yf

from src.config import (
    ENTRY_POLICY_ENABLED,
    HOURLY_MA_LONG,
    HOURLY_MA_SHORT,
    MIN1_MA_PERIOD,
    TAKE_PROFIT_RCI_THRESHOLD,
    RCI_APPROACH_THRESHOLD,
    RCI_LOOKBACK_BARS,
    RCI_PERIOD,
)

log = logging.getLogger(__name__)

# check() は新規エントリー探索の tick ごとに、同じ entry_candidate に対して
# 繰り返し呼ばれ得る。_check_hourly_uptrend はキャッシュなしで毎回 yfinance に
# 通信するため、候補数が多い日はこれだけで tick 全体を長時間ブロックしうる
# （_get_hist_avgs と同種の問題）。短時間キャッシュで同一銘柄への連続呼び出しを防ぐ。
_UPTREND_CACHE_TTL_SEC = 300  # 5分
_uptrend_cache: dict[str, tuple[float, bool, str]] = {}  # symbol -> (取得時刻, ok, detail)


def _yf_symbol(symbol: str) -> str:
    return f"{symbol}.T"


def _calc_rci(closes: list[float], n: int) -> float:
    """RCI (Rank Correlation Index) を計算する。

    pandas.Series.rank(method='average') で同値タイを平均順位として扱い、
    sorted_prices.index() による誤計算（同一価格が全て rank=1 になる）を回避する。
    """
    if len(closes) < n:
        return 0.0
    recent = closes[-n:]
    time_ranks = list(range(1, n + 1))  # 最古=1, 最新=n
    price_ranks = pd.Series(recent).rank(ascending=True, method="average").tolist()
    d_sq = sum((t - p) ** 2 for t, p in zip(time_ranks, price_ranks))
    rci = (1 - 6 * d_sq / (n * (n ** 2 - 1))) * 100
    return round(rci, 2)


def _check_hourly_uptrend(symbol: str) -> tuple[bool, str]:
    """① 1時間足が上昇トレンドか確認する。"""
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1h", period="5d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is None or len(df) < HOURLY_MA_LONG:
            return False, f"1H データ不足 ({len(df) if df is not None else 0}本)"

        closes = df["Close"].tolist()
        ma_short = pd.Series(closes).rolling(HOURLY_MA_SHORT).mean().tolist()
        ma_long  = pd.Series(closes).rolling(HOURLY_MA_LONG).mean().tolist()

        last_short = ma_short[-1]
        last_long  = ma_long[-1]
        prev_short = ma_short[-2]

        if last_short is None or last_long is None or prev_short is None:
            return False, "MA 計算不足"

        if last_short <= last_long:
            return False, f"1H MA{HOURLY_MA_SHORT}({last_short:.0f}) <= MA{HOURLY_MA_LONG}({last_long:.0f})"

        if last_short <= prev_short:
            return False, f"1H MA{HOURLY_MA_SHORT} 傾き NG ({prev_short:.0f}→{last_short:.0f})"

        return True, f"1H MA{HOURLY_MA_SHORT}>{HOURLY_MA_LONG} 傾き上昇"

    except Exception as e:
        return False, f"1H データ取得エラー: {e}"


def _check_min1_ma_rising(symbol: str) -> tuple[bool, str]:
    """② 1分足の移動平均が上昇しているか確認する。"""
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1m", period="1d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is None or len(df) < MIN1_MA_PERIOD + 1:
            return False, f"1分足データ不足 ({len(df) if df is not None else 0}本)"

        closes = df["Close"].tolist()
        ma = pd.Series(closes).rolling(MIN1_MA_PERIOD).mean().tolist()

        if ma[-1] is None or ma[-2] is None:
            return False, "1分足 MA 計算不足"

        if ma[-1] <= ma[-2]:
            return False, f"1分足 MA{MIN1_MA_PERIOD} 下降 ({ma[-2]:.2f}→{ma[-1]:.2f})"

        return True, f"1分足 MA{MIN1_MA_PERIOD} 上昇"

    except Exception as e:
        return False, f"1分足データ取得エラー: {e}"


def _check_rci_reversal(symbol: str) -> tuple[bool, str]:
    """③ RCI が -80 以下に接近後、反転上昇中か確認する。"""
    need = RCI_PERIOD + RCI_LOOKBACK_BARS + 2
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1m", period="1d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is None or len(df) < need:
            return False, f"RCI 用データ不足 ({len(df) if df is not None else 0}本 / 必要 {need}本)"

        closes = df["Close"].tolist()
        # 直近 lookback+2 本分の RCI 系列を計算
        rci_series: list[float] = []
        for i in range(RCI_LOOKBACK_BARS + 2):
            end = len(closes) - i
            rci_series.insert(0, _calc_rci(closes[:end], RCI_PERIOD))

        touched = any(r <= RCI_APPROACH_THRESHOLD for r in rci_series[:-1])
        rising  = rci_series[-1] > rci_series[-2]
        recovered = rci_series[-1] > RCI_APPROACH_THRESHOLD

        rci_tail = " ".join(f"{r:.0f}" for r in rci_series[-5:])
        log.info("[RCI] %s 直近5本: [%s]  touched=%s rising=%s recovered=%s",
                 symbol, rci_tail, touched, rising, recovered)

        if not touched:
            return False, f"RCI が {RCI_APPROACH_THRESHOLD} 以下に未到達 (直近: {rci_series[-1]:.1f})"
        if not rising:
            return False, f"RCI 反転上昇 NG ({rci_series[-2]:.1f}→{rci_series[-1]:.1f})"
        if not recovered:
            return False, f"RCI まだ閾値以下 ({rci_series[-1]:.1f})"

        return True, f"RCI 反転上昇 ({rci_series[-2]:.1f}→{rci_series[-1]:.1f})"

    except Exception as e:
        return False, f"RCI 計算エラー: {e}"


def check(symbol: str) -> tuple[bool, str]:
    """1H上昇トレンドのみ確認してエントリー可否を返す。(ok, reason_str)

    1分足MAとRCIはsurge_scoreが実質的にカバーするため廃止。
    """
    if not ENTRY_POLICY_ENABLED:
        return True, "ポリシーチェック無効"

    cached = _uptrend_cache.get(symbol)
    now = time.monotonic()
    if cached is not None and (now - cached[0]) < _UPTREND_CACHE_TTL_SEC:
        return cached[1], cached[2]

    ok, detail = _check_hourly_uptrend(symbol)
    if not ok:
        log.info("[POLICY NG] %s — 1H上昇トレンド: %s", symbol, detail)
        result = (False, f"1H上昇トレンド: {detail}")
    else:
        log.info("[POLICY OK] %s — 1H上昇トレンド: %s", symbol, detail)
        result = (True, detail)

    _uptrend_cache[symbol] = (now, result[0], result[1])
    return result


def check_rci_overbought(symbol: str) -> tuple[bool, str]:
    """RCI が過買い水準（+80以上）に達しているか確認する。

    利確キープゾーン中に毎 tick 呼ばれる。
    ① board価格履歴（price_cache）を優先（ノーウェイト）
    ② データ不足時のみ yfinance を1回だけ試みる
    ③ 両方失敗した場合は True（強制利確）
    """
    from src import price_cache

    need = RCI_PERIOD + 2

    # ① board価格履歴を優先（trade_engine が 60 秒ごとに蓄積）
    cached = price_cache.get(symbol)
    if len(cached) >= need:
        rci = _calc_rci(cached, RCI_PERIOD)
        if rci >= TAKE_PROFIT_RCI_THRESHOLD:
            return True, f"RCI {rci:.1f} >= {TAKE_PROFIT_RCI_THRESHOLD:.0f}"
        return False, f"RCI {rci:.1f} < {TAKE_PROFIT_RCI_THRESHOLD:.0f}（キープ）"

    # ② board履歴不足 → yfinance を1回だけ試みる
    try:
        df = yf.download(
            _yf_symbol(symbol), interval="1m", period="1d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is None or len(df) < need:
            return True, f"1分足データ不足({len(df) if df is not None else 0}本) → 強制利確"
        closes = df["Close"].tolist()
        rci = _calc_rci(closes, RCI_PERIOD)
        if rci >= TAKE_PROFIT_RCI_THRESHOLD:
            return True, f"RCI {rci:.1f} >= {TAKE_PROFIT_RCI_THRESHOLD:.0f}"
        return False, f"RCI {rci:.1f} < {TAKE_PROFIT_RCI_THRESHOLD:.0f}（キープ）"
    except Exception as e:
        log.warning("check_rci_overbought %s yfinance失敗: %s → 強制利確", symbol, e)
        return True, f"yfinance失敗 → 強制利確: {e}"
