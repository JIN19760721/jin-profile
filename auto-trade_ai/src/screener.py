import logging
from datetime import datetime

from src.momentum_predictor import compute_predicted_change_pct
from src.config import (
    MIN_TRADING_VOLUME,
    SCORE_PRICE_CHANGE,
    SCORE_TURNOVER,
    SCORE_VOLUME,
)
from src.ranking_fetcher import RANKING_LABEL

log = logging.getLogger(__name__)

# デイトレ対象外の銘柄を除外するキーワード（モニターと共通）
_EXCLUDE_NAME_KEYWORDS = [
    "ＥＴＦ", "ETF", "ＥＴＮ", "ETN",
    "上場投信", "上場投資信託",
    "国債", "社債",
    "ファンド",
]


def _is_tradable(item: dict) -> bool:
    """ETF・国債・投資信託など、デイトレ対象外の銘柄を除外する。

    銘柄コードに英字が含まれるかどうかでは判定しない。JPXは2024年頃から
    ETF/ETN以外の通常の新規上場企業にも英字入りコードを割り当てており、
    コード形式による除外は対象を広げすぎてしまうため。
    """
    name = item.get("SymbolName", "") or ""
    return not any(kw in name for kw in _EXCLUDE_NAME_KEYWORDS)


# ランキング種別 → スコア配点
_SCORE_MAP: dict[int, int] = {
    1: SCORE_PRICE_CHANGE,
    6: SCORE_VOLUME,
    7: SCORE_TURNOVER,
}

# 順位ペナルティ: 1位で 0点、100位で最大 5点 減点
_MAX_RANK_PENALTY = 5.0
_RANK_PENALTY_DIVISOR = 20.0


def _rank_penalty(rank: int) -> float:
    return -min(rank / _RANK_PENALTY_DIVISOR, _MAX_RANK_PENALTY)


def _extract_base_info(item: dict) -> dict:
    return {
        "Symbol":                 item.get("Symbol", ""),
        "SymbolName":             item.get("SymbolName", ""),
        "ExchangeName":           item.get("ExchangeName", ""),
        "CategoryName":           item.get("CategoryName", ""),
        "CurrentPrice":           item.get("CurrentPrice"),
        "ChangePercentage":       item.get("ChangePercentage"),
        "TradingVolume":          item.get("TradingVolume"),
        "Turnover":               item.get("Turnover"),
        "RapidTradePercentage":   item.get("RapidTradePercentage"),
        "RapidPaymentPercentage": item.get("RapidPaymentPercentage"),
        "TickCount":              item.get("TickCount"),
    }


def _update_info(existing: dict, item: dict) -> None:
    """後続ランキングのアイテムで価格・出来高などを上書きする（None でない場合のみ）。"""
    for key in (
        "CurrentPrice", "ChangePercentage", "TradingVolume", "Turnover",
        "RapidTradePercentage", "RapidPaymentPercentage", "TickCount",
    ):
        val = item.get(key)
        if val is not None:
            existing[key] = val


def merge_and_score(rankings: dict[int, list[dict]]) -> list[dict]:
    """
    全ランキングを Symbol で統合してスコアを計算し、スコア降順のリストを返す。

    - MIN_TRADING_VOLUME 未満の銘柄はスコアリング対象から除外する
    - どのランキングにも出現しない銘柄は除外する
    """
    # Symbol → 基本情報
    merged: dict[str, dict] = {}

    # rank_type → {Symbol: rank_no} のマップを事前構築
    rank_maps: dict[int, dict[str, int]] = {}
    cnt_raw = 0
    cnt_no_tradable = 0

    for rank_type, items in rankings.items():
        rank_map = {item["Symbol"]: item["No"] for item in items if item.get("Symbol")}
        rank_maps[rank_type] = rank_map
        cnt_raw += len(items)

        for item in items:
            sym = item.get("Symbol")
            if not sym:
                continue
            if not _is_tradable(item):
                cnt_no_tradable += 1
                continue
            if sym not in merged:
                merged[sym] = _extract_base_info(item)
            else:
                _update_info(merged[sym], item)

    log.info(
        "スクリーニング: ランキング合計 %d 件 → ETFフィルタ除外 %d 件 → マージ後ユニーク %d 銘柄",
        cnt_raw, cnt_no_tradable, len(merged),
    )

    fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    results: list[dict] = []

    cnt_volume_ng = 0
    cnt_no_rank   = 0

    for sym, info in merged.items():
        # 最低出来高フィルター（None はランキング種別によりAPIが未返却のため除外しない）
        vol = info.get("TradingVolume")
        if vol is not None and vol < MIN_TRADING_VOLUME:
            cnt_volume_ng += 1
            continue

        score = 0.0
        reasons: list[str] = []

        for rank_type, base_score in _SCORE_MAP.items():
            rank_no = rank_maps.get(rank_type, {}).get(sym)
            if rank_no is not None:
                gained = base_score + _rank_penalty(rank_no)
                score += gained
                reasons.append(f"{RANKING_LABEL[rank_type]}({rank_no}位)")

        if not reasons:
            cnt_no_rank += 1
            continue

        predicted_change_pct, momentum_basis = compute_predicted_change_pct(
            info, rank_maps
        )

        results.append({
            **info,
            "score":                round(score, 1),
            "reasons":              " / ".join(reasons),
            "predicted_change_pct": predicted_change_pct,
            "momentum_basis":       momentum_basis,
            "fetched_at":           fetched_at,
        })

    log.info(
        "スクリーニング結果: 出来高NG=%d / ランクなし=%d / 最終候補=%d件 (MIN_TRADING_VOLUME=%d)",
        cnt_volume_ng, cnt_no_rank, len(results), MIN_TRADING_VOLUME,
    )

    # 候補が0件の場合: TradingVolume の実態を診断ログ出力
    if not results and merged:
        samples = list(merged.items())[:5]
        log.warning("候補0件のため診断: 先頭%d銘柄の TradingVolume を確認してください", len(samples))
        for sym, info in samples:
            log.warning(
                "  %s(%s) TradingVolume=%s CurrentPrice=%s",
                sym, info.get("SymbolName", "?"),
                info.get("TradingVolume"), info.get("CurrentPrice"),
            )

    return sorted(results, key=lambda x: x["score"], reverse=True)
