"""
寄り付き前スキャン（yfinance ベース）

kabu station ランキング API は 9:00 前に利用不可のため、
前日の日足データを使って同等のスコアリングを行い、
8:00 時点で当日の有力候補を daily_candidates に保存する。

スコアリング方式は screener.merge_and_score() と同一：
  - Type1 相当: 前日終値騰落率ランキング上位50件
  - Type6 相当: 前日出来高 / 20日平均出来高（急増率）上位50件
  - Type7 相当: 前日売買代金 / 20日平均売買代金（急増率）上位50件
"""

import logging
import sqlite3
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

from src.config import (
    DB_PATH,
    MIN_TRADING_VOLUME,
    SCORE_PRICE_CHANGE,
    SCORE_TURNOVER,
    SCORE_VOLUME,
)

log = logging.getLogger(__name__)

# ランキング取得上位件数（kabu station と揃える）
_TOP_N = 50

# 移動平均の基準日数
_MA_DAYS = 20

# スコアリング配点（screener.py と同一）
_MAX_RANK_PENALTY = 5.0
_RANK_PENALTY_DIVISOR = 20.0


def _rank_penalty(rank: int) -> float:
    return -min(rank / _RANK_PENALTY_DIVISOR, _MAX_RANK_PENALTY)


# ── ユニバース定義 ─────────────────────────────────────────────────────────
# 1. 過去の daily_candidates から動的取得
# 2. Nikkei 225 主要構成銘柄（固定）
_NIKKEI225_SEEDS = [
    # 指数・金融・保険
    "8306", "8316", "8411", "8604", "8766", "8591",
    # 自動車
    "7203", "7267", "7201", "7269", "7270", "7011",
    # 電機・半導体
    "6501", "6752", "6758", "6954", "6857", "8035",
    # IT・通信
    "9984", "9433", "9432", "4689",
    # 精密・機械
    "7733", "6301", "6326", "6361", "7832",
    # 素材・化学
    "4063", "4188", "4452", "5401", "5713",
    # 建設・不動産
    "1803", "1925", "3402",
    # 商社・小売
    "8058", "8031", "7974", "2914",
    # 医薬・ヘルスケア
    "4568", "4519", "4523",
    # 輸送・物流
    "9101", "9104", "9202",
    # エネルギー
    "5020", "1605",
]


def _build_universe() -> list[str]:
    """過去の daily_candidates + Nikkei 225 シードを合わせたユニーク銘柄リストを返す。"""
    symbols: set[str] = set(_NIKKEI225_SEEDS)
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT DISTINCT symbol FROM daily_candidates").fetchall()
        conn.close()
        for r in rows:
            symbols.add(r[0])
    except Exception as e:
        log.warning("ユニバース構築: DB 読み込み失敗 (%s)", e)
    return sorted(symbols)


# ── データ取得 ────────────────────────────────────────────────────────────

def _fetch_daily(symbols: list[str]) -> pd.DataFrame:
    """yfinance でまとめてダウンロードする。戻り値は MultiIndex DataFrame。"""
    tickers = [f"{s}.T" for s in symbols]
    period_days = _MA_DAYS + 5  # バッファ込み
    df = yf.download(
        tickers,
        period=f"{period_days}d",
        interval="1d",
        progress=False,
        auto_adjust=True,
        group_by="ticker",
    )
    return df


# ── スコアリング ──────────────────────────────────────────────────────────

def _compute_metrics(df: pd.DataFrame, symbols: list[str]) -> list[dict]:
    """前日データから騰落率・出来高比・売買代金比を計算して返す。"""
    records = []
    for sym in symbols:
        ticker = f"{sym}.T"
        try:
            if ticker not in df.columns.get_level_values(0):
                continue
            sub = df[ticker].dropna(subset=["Close", "Volume"])
            if len(sub) < _MA_DAYS + 1:
                continue

            # 直近 = 前日（最終行）
            yesterday = sub.iloc[-1]
            prev      = sub.iloc[-2]

            close_y  = float(yesterday["Close"])
            close_p  = float(prev["Close"])
            vol_y    = float(yesterday["Volume"])
            vol_ma   = float(sub["Volume"].iloc[-_MA_DAYS - 1:-1].mean())
            to_y     = close_y * vol_y
            to_ma    = (sub["Close"] * sub["Volume"]).iloc[-_MA_DAYS - 1:-1].mean()

            if close_p <= 0 or vol_ma <= 0 or to_ma <= 0:
                continue

            price_change_pct  = (close_y - close_p) / close_p * 100
            volume_surge_ratio  = vol_y / vol_ma
            turnover_surge_ratio = to_y / to_ma

            records.append({
                "symbol":                sym,
                "current_price":         round(close_y, 1),
                "price_change_pct":      round(price_change_pct, 2),
                "volume_surge_ratio":    round(volume_surge_ratio, 3),
                "turnover_surge_ratio":  round(turnover_surge_ratio, 3),
                "trading_volume":        int(vol_y),
            })
        except Exception:
            continue
    return records


def _make_rankings(records: list[dict]) -> dict[str, list[tuple[str, int]]]:
    """各指標で上位 _TOP_N 件をランキング形式で返す。"""
    def top_n(key: str, ascending: bool = False) -> list[tuple[str, int]]:
        sorted_recs = sorted(records, key=lambda r: r[key], reverse=not ascending)
        return [(r["symbol"], rank + 1) for rank, r in enumerate(sorted_recs[:_TOP_N])]

    return {
        "price_change":  top_n("price_change_pct"),   # Type1 相当（騰落率）
        "volume_surge":  top_n("volume_surge_ratio"),  # Type6 相当（出来高急増）
        "turnover_surge": top_n("turnover_surge_ratio"),  # Type7 相当（売買代金急増）
    }


def _score_candidates(records: list[dict], rankings: dict) -> list[dict]:
    """ランキング出現状況からスコアを計算する（screener.py と同一ロジック）。"""
    rank_lookup = {
        "price_change":   {sym: rank for sym, rank in rankings["price_change"]},
        "volume_surge":   {sym: rank for sym, rank in rankings["volume_surge"]},
        "turnover_surge": {sym: rank for sym, rank in rankings["turnover_surge"]},
    }

    score_config = {
        "price_change":   SCORE_PRICE_CHANGE,
        "volume_surge":   SCORE_VOLUME,
        "turnover_surge": SCORE_TURNOVER,
    }

    label_map = {
        "price_change":   "値上がり率",
        "volume_surge":   "出来高急増",
        "turnover_surge": "売買代金急増",
    }

    info_map = {r["symbol"]: r for r in records}
    results = []

    # 3種ランキングのどれかに入った銘柄が対象
    all_syms: set[str] = set()
    for sym_rank_list in rankings.values():
        for sym, _ in sym_rank_list:
            all_syms.add(sym)

    for sym in all_syms:
        info = info_map.get(sym)
        if not info:
            continue

        # 最低出来高フィルター
        vol = info.get("trading_volume")
        if vol is not None and vol < MIN_TRADING_VOLUME:
            continue

        score   = 0.0
        reasons = []

        for key, base_score in score_config.items():
            rank_no = rank_lookup[key].get(sym)
            if rank_no is not None:
                score += base_score + _rank_penalty(rank_no)
                reasons.append(f"{label_map[key]}({rank_no}位)")

        if not reasons:
            continue

        results.append({
            "symbol":        sym,
            "symbol_name":   None,  # yfinance では銘柄名が取りにくいため None
            "current_price": info["current_price"],
            "score":         round(score, 1),
            "reasons":       " / ".join(reasons),
        })

    return sorted(results, key=lambda x: x["score"], reverse=True)


# ── エントリポイント ───────────────────────────────────────────────────────

def run_premarket_scan() -> list[dict]:
    """
    寄り付き前スキャンを実行して候補リストを返す。

    戻り値は screener.merge_and_score() と同じ形式のリスト。
    """
    log.info("[事前スキャン] yfinance ベースの寄り付き前スキャンを開始します")

    universe = _build_universe()
    log.info("[事前スキャン] ユニバース: %d銘柄", len(universe))

    log.info("[事前スキャン] 前日データ取得中... (yfinance)")
    try:
        df = _fetch_daily(universe)
    except Exception as e:
        log.error("[事前スキャン] データ取得失敗: %s", e)
        return []

    if df is None or df.empty:
        log.warning("[事前スキャン] データが空でした")
        return []

    records = _compute_metrics(df, universe)
    log.info("[事前スキャン] 指標計算完了: %d銘柄", len(records))

    if not records:
        log.warning("[事前スキャン] 指標計算結果が0件")
        return []

    rankings = _make_rankings(records)
    log.info(
        "[事前スキャン] ランキング: 騰落率=%d件 / 出来高急増=%d件 / 売買代金急増=%d件",
        len(rankings["price_change"]),
        len(rankings["volume_surge"]),
        len(rankings["turnover_surge"]),
    )

    candidates = _score_candidates(records, rankings)
    log.info(
        "[事前スキャン] スコアリング完了: %d件 (score>=60: %d件)",
        len(candidates),
        sum(1 for c in candidates if c["score"] >= 60),
    )

    return candidates
