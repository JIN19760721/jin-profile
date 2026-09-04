"""
J-Quants API V2 から上場銘柄一覧・日次株価を取得する。

認証方式: APIキー直接指定（x-api-key ヘッダー）
  - .env の JQUANTS_API_KEY に J-Quants ダッシュボードで発行したAPIキーを設定する
"""

import logging

import requests

from config import JQUANTS_API_KEY, JQUANTS_BASE_URL

logger = logging.getLogger(__name__)


def _headers() -> dict:
    return {"x-api-key": JQUANTS_API_KEY}


def fetch_listed_companies() -> list[dict]:
    """上場銘柄一覧を取得して DB 保存用の辞書リストを返す"""
    logger.info("J-Quants: 上場銘柄一覧取得中...")
    res = requests.get(
        f"{JQUANTS_BASE_URL}/equities/master",
        headers=_headers(),
        timeout=60,
    )
    res.raise_for_status()
    items = res.json().get("data", [])
    logger.info("上場銘柄: %d 件", len(items))

    return [
        {
            "code":          item.get("Code", ""),
            "company_name":  item.get("CoName", ""),
            "market_type":   item.get("Mkt", ""),
            "sector17_code": item.get("S17", ""),
            "sector33_code": item.get("S33", ""),
            "size_code":     item.get("ScaleCat", ""),
            "updated_date":  item.get("Date", ""),
        }
        for item in items
    ]


def fetch_daily_quotes(target_date: str) -> list[dict]:
    """
    指定日（YYYY-MM-DD）の全銘柄日次株価を取得する。
    ページネーションを自動処理し、DB 保存用の辞書リストを返す。
    Freeプランのレート制限（5リクエスト/分）に対応するためページ間に遅延を挿入する。
    """
    import time

    logger.info("J-Quants: %s の日次株価取得中...", target_date)

    # APIは YYYYMMDD 形式を受け付ける
    date_param = target_date.replace("-", "")

    quotes: list[dict] = []
    page = 1

    while True:
        if page > 1:
            time.sleep(13)  # Freeプラン: 5リクエスト/分 → 12秒以上の間隔

        params: dict = {"date": date_param, "page": page}
        res = requests.get(
            f"{JQUANTS_BASE_URL}/equities/bars/daily",
            headers=_headers(),
            params=params,
            timeout=60,
        )
        res.raise_for_status()
        body = res.json()
        batch = body.get("data", [])
        quotes.extend(batch)

        logger.info("  ページ %d: %d 件", page, len(batch))

        # ページネーション: データが空または5000件未満なら最終ページ
        if not batch or len(batch) < 5000:
            break
        page += 1

    logger.info("日次株価: %s で %d 件取得", target_date, len(quotes))

    # DB スキーマに合わせてフィールド名を変換
    return [
        {
            "Date":             q.get("Date", ""),
            "Code":             q.get("Code", ""),
            "Open":             q.get("O"),
            "High":             q.get("H"),
            "Low":              q.get("L"),
            "Close":            q.get("C"),
            "UpperLimit":       q.get("UL"),
            "LowerLimit":       q.get("LL"),
            "Volume":           q.get("Vo"),
            "TurnoverValue":    q.get("Va"),
            "AdjustmentFactor": q.get("AdjFactor"),
            "AdjustmentOpen":   q.get("AdjO"),
            "AdjustmentHigh":   q.get("AdjH"),
            "AdjustmentLow":    q.get("AdjL"),
            "AdjustmentClose":  q.get("AdjC"),
            "AdjustmentVolume": q.get("AdjVo"),
        }
        for q in quotes
    ]


def validate_credentials():
    """API キーが設定されているか確認する"""
    if not JQUANTS_API_KEY:
        raise ValueError(
            "J-Quants の API キーが設定されていません。\n"
            "J-Quants ダッシュボード (https://jpx-jquants.com/) で API キーを発行し、\n"
            ".env ファイルに JQUANTS_API_KEY=<キー> を設定してください。"
        )


def debug_connection() -> None:
    """
    API 接続診断。
    python fetch_jquants.py で単独実行可能。
    """
    logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(message)s")

    if not JQUANTS_API_KEY:
        logger.error("JQUANTS_API_KEY が未設定です。.env を確認してください。")
        return

    masked = JQUANTS_API_KEY[:4] + "*" * (len(JQUANTS_API_KEY) - 4)
    logger.info("JQUANTS_API_KEY (先頭4文字): %s  長さ: %d文字", masked, len(JQUANTS_API_KEY))

    probe_url = f"{JQUANTS_BASE_URL}/equities/master"
    logger.info("--- GET %s ---", probe_url)
    try:
        res = requests.get(probe_url, headers=_headers(), timeout=30)
        logger.info("status_code: %d", res.status_code)
        if res.status_code == 200:
            data = res.json().get("data", [])
            logger.info("★ 接続成功！ 銘柄数: %d 件", len(data))
        else:
            logger.error("response.text: %s", res.text[:300])
    except Exception as e:
        logger.error("リクエスト例外: %s", e)


if __name__ == "__main__":
    debug_connection()
