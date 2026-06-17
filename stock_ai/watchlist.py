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
_CODE_RE = re.compile(r"\b\d{4}\b")
_WATCH_PREFIX_RE = re.compile(r"^(監視|watch)\s*", re.IGNORECASE)


def parse_watch_codes(text: str) -> list[str]:
    """
    テキストから4桁銘柄コードを抽出して返す（重複除外・入力順を維持）。
    "監視" / "watch" プレフィックスは除去してから抽出する。
    最大件数チェックは呼び出し元で行う。
    """
    cleaned = _WATCH_PREFIX_RE.sub("", text.strip())
    found = _CODE_RE.findall(cleaned)
    seen: set[str] = set()
    result: list[str] = []
    for c in found:
        if c not in seen:
            seen.add(c)
            result.append(c)
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
            if len(db_code) == 5 and db_code.endswith("0"):
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
    登録した銘柄の dict リストを返す。
    """
    from db import deactivate_watchlist, upsert_watchlist_entries

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
