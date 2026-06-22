"""
watchlist（監視対象銘柄）の管理。

LINE Webhook または CLI から登録された銘柄を保持し、
--intraday 実行時に --codes が未指定の場合のフォールバック先として使う。
"""

import logging
import re
import sqlite3
from datetime import date

from config import DB_PATH

logger = logging.getLogger(__name__)

_MAX_WATCH_CODES = 5
_CODE_RE = re.compile(r"\b[0-9A-Za-z]{4}\b")
_WATCH_PREFIX_RE = re.compile(r"^(監視|watch)\s*", re.IGNORECASE)


def parse_watch_codes(text: str) -> list[str]:
    """
    テキストから4桁銘柄コード（数字のみ、または英字を含む新形式）を抽出して返す
    （重複除外・入力順を維持）。"監視" / "watch" プレフィックスは除去してから抽出する。
    最大件数チェックは呼び出し元で行う。
    """
    cleaned = _WATCH_PREFIX_RE.sub("", text.strip())
    found = _CODE_RE.findall(cleaned)
    seen: set[str] = set()
    result: list[str] = []
    for c in found:
        code = c.upper()
        if code not in seen:
            seen.add(code)
            result.append(code)
    return result


def validate_codes_in_latest_ranking(codes: list[str]) -> dict:
    """
    analysis_results の最新日付ランキングに含まれるか確認する。

    Returns:
        dict:
            valid        : ランキングに含まれるコードのリスト
            invalid      : ランキングに含まれないコードのリスト
            latest_date  : 最新分析日（str）、データなしは None
            company_names: {code: company_name} のマッピング
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row

        row = conn.execute("SELECT MAX(date) FROM analysis_results").fetchone()
        latest_date = row[0] if row and row[0] else None

        if not latest_date:
            conn.close()
            logger.warning("analysis_results にデータがありません")
            return {"valid": [], "invalid": list(codes), "latest_date": None, "company_names": {}}

        rows = conn.execute(
            "SELECT code, company_name FROM analysis_results WHERE date = ?",
            (latest_date,),
        ).fetchall()
        conn.close()

        # 4桁・5桁両方でルックアップできるようにマッピングを構築
        ranking_map: dict[str, str] = {}  # normalized_key → company_name
        for r in rows:
            db_code = r["code"]
            name = r["company_name"] or ""
            ranking_map[db_code] = name
            # 5桁コード（末尾0）なら4桁キーも登録
            if len(db_code) == 5 and db_code.isdigit() and db_code.endswith("0"):
                ranking_map[db_code[:-1]] = name

        valid: list[str] = []
        invalid: list[str] = []
        company_names: dict[str, str] = {}

        for code in codes:
            if code in ranking_map:
                valid.append(code)
                company_names[code] = ranking_map[code]
            else:
                invalid.append(code)

        return {
            "valid": valid,
            "invalid": invalid,
            "latest_date": latest_date,
            "company_names": company_names,
        }
    except Exception as e:
        logger.error("ランキング検証エラー: %s", e)
        return {"valid": [], "invalid": list(codes), "latest_date": None, "company_names": {}}


def register_watchlist(codes: list[str], source: str = "LINE") -> list[dict]:
    """
    既存のアクティブ監視銘柄を全て無効化し、指定銘柄を is_active=1 で登録する。
    最大 _MAX_WATCH_CODES（5）件を超える場合は先頭から切り捨てる
    （--intraday の対象は最大5件のため、watchlist もそれに合わせる）。
    登録した銘柄の dict リストを返す。
    """
    from db import deactivate_watchlist, upsert_watchlist_entries

    if len(codes) > _MAX_WATCH_CODES:
        logger.warning(
            "watchlist登録: %d 件指定されましたが、最大 %d 件までに制限します（切り捨て: %s）",
            len(codes), _MAX_WATCH_CODES, codes[_MAX_WATCH_CODES:],
        )
        codes = codes[:_MAX_WATCH_CODES]

    result = validate_codes_in_latest_ranking(codes)
    company_names = result["company_names"]
    selected_date = result["latest_date"] or str(date.today())

    deactivate_watchlist()

    rows = [
        {
            "code": code,
            "company_name": company_names.get(code, ""),
            "selected_date": selected_date,
            "source": source,
        }
        for code in codes
    ]
    upsert_watchlist_entries(rows)
    logger.info("watchlist 登録完了: %s (source=%s)", codes, source)
    return rows


def get_active_watchlist() -> list[dict]:
    """is_active=1 の監視対象銘柄一覧を返す"""
    from db import get_active_watchlist as _db_get
    return _db_get()


def get_top_ranked_codes(limit: int = 5) -> list[str]:
    """
    analysis_results の最新分析日のランキング上位 limit 件のコードを返す。
    --codes 未指定かつ watchlist が空の場合の、--intraday のフォールバック先として使う。
    データがなければ空リストを返す。
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute("SELECT MAX(date) FROM analysis_results").fetchone()
        latest_date = row[0] if row and row[0] else None
        if not latest_date:
            conn.close()
            logger.warning("analysis_results にデータがありません")
            return []

        rows = conn.execute(
            "SELECT code FROM analysis_results WHERE date = ? ORDER BY rank ASC LIMIT ?",
            (latest_date, limit),
        ).fetchall()
        conn.close()
        return [r[0] for r in rows]
    except Exception as e:
        logger.error("ランキング上位取得エラー: %s", e)
        return []
