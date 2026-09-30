import logging
from datetime import datetime

from src.config import RANKING_TYPES
from src.kabu_client import KabuClient

log = logging.getLogger(__name__)

RANKING_LABEL: dict[int, str] = {
    1: "値上がり率",
    6: "売買高急増",
    7: "売買代金急増",
}


def _empty_hint() -> str:
    now = datetime.now().time()
    h, m = now.hour, now.minute
    total = h * 60 + m
    if total < 9 * 60 + 10:
        return "前場準備中（7:53〜9:10）のためランキングが空になる場合があります。"
    if 11 * 60 + 30 <= total < 12 * 60 + 30:
        return "昼休み中（11:30〜12:30）のためランキングが空になる場合があります。"
    if total >= 15 * 60 + 30:
        return "取引終了後（15:30〜）のためランキングが空です。"
    return "取引時間中にもかかわらず空です。kabuステーションの接続環境（test/prod）を確認してください。"


def fetch_all_rankings(
    client: KabuClient, exchange: str
) -> dict[int, list[dict]]:
    """
    RANKING_TYPES に定義された全ランキング種別を取得し、
    {type: [ランキングアイテム, ...]} の辞書で返す。

    取得失敗・空レスポンスの場合はログを出力し、空リストを格納して継続する。
    """
    results: dict[int, list[dict]] = {}

    for rank_type in RANKING_TYPES:
        label = RANKING_LABEL.get(rank_type, f"Type={rank_type}")
        log.info(
            "ランキング取得中: %s (Type=%d, ExchangeDivision=%s)",
            label, rank_type, exchange,
        )
        try:
            data = client.get(
                "/ranking",
                params={"Type": rank_type, "ExchangeDivision": exchange},
            )
            items: list[dict] = data.get("Ranking") or []

            if not items:
                log.warning(
                    "ランキング [%s] のレスポンスが空でした。%s", label, _empty_hint()
                )
            else:
                log.info("  → %d 件取得", len(items))

            results[rank_type] = items

        except Exception as e:
            log.error("ランキング [%s] 取得失敗: %s", label, e)
            results[rank_type] = []

    return results
