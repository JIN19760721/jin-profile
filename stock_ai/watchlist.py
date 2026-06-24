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


_STOP_HIGH_SOURCE = "STOP_HIGH"
_SCORED_SLOTS = 5  # スコア順位スロット数（ストップ高枠は別途+1）


def _normalize_codes(codes: list[str]) -> list[str]:
    """5桁J-Quantsコード（末尾0）を4桁に正規化する"""
    return [c[:-1] if len(c) == 5 and c.isdigit() and c.endswith("0") else c for c in codes]


def register_default_watchlist(
    scored_codes: list[str], stop_high_code: str | None = None,
) -> list[dict]:
    """
    main.py の分析実行時に呼ぶ、watchlistの全面更新（日次のデフォルト登録）。
    スコア上位5銘柄（slot_rank=1〜5, source="RANKING"）＋ストップ高翌日継続候補
    （slot_rank=None, source="STOP_HIGH"）の最大6件を登録する。
    既存のwatchlist（LINE指示分も含む）は全て無効化してから登録し直す
    （1日の分析実行ごとにリセットする想定）。
    """
    from db import deactivate_watchlist, upsert_watchlist_entries

    scored_codes = _normalize_codes(scored_codes)[:_SCORED_SLOTS]
    all_codes = list(scored_codes)
    if stop_high_code:
        stop_high_code = _normalize_codes([stop_high_code])[0]
        if stop_high_code not in all_codes:
            all_codes.append(stop_high_code)

    result = validate_codes_in_latest_ranking(all_codes)
    company_names = result["company_names"]
    selected_date = result["latest_date"] or str(date.today())

    deactivate_watchlist()

    rows = [
        {
            "code": code,
            "company_name": company_names.get(code, ""),
            "selected_date": selected_date,
            "source": "RANKING",
            "slot_rank": i + 1,
        }
        for i, code in enumerate(scored_codes)
    ]
    if stop_high_code:
        rows.append({
            "code": stop_high_code,
            "company_name": company_names.get(stop_high_code, ""),
            "selected_date": selected_date,
            "source": _STOP_HIGH_SOURCE,
            "slot_rank": None,
        })

    upsert_watchlist_entries(rows)
    logger.info("watchlist 登録完了（デフォルト）: %s (ストップ高枠=%s)", scored_codes, stop_high_code)
    return rows


def apply_line_watchlist(codes: list[str]) -> list[dict]:
    """
    LINE指示による監視銘柄の上書き。既存のwatchlist全体を無効化するのではなく、
    現在アクティブな「スコア順位スロット」(1〜5) のうち優先度が低い（slot_rankが
    大きい、または空いている）スロットから順に、指定銘柄で上書きする。
    上書きされた銘柄は、占有したスロット番号をそのまま引き継ぐため、次にLINE指示が
    あった際も同じ基準（スコア下位＝スロット番号が大きい方）で再度上書きされる。
    ストップ高枠（source="STOP_HIGH"）は対象外で、常にそのまま維持される。
    登録した銘柄の dict リストを返す（5件を超える分は先頭5件に切り捨て）。
    """
    from db import deactivate_watchlist_codes, get_active_watchlist, upsert_watchlist_entries

    codes = _normalize_codes(codes)[:_SCORED_SLOTS]
    if not codes:
        return []

    existing = [row for row in get_active_watchlist() if row.get("source") != _STOP_HIGH_SOURCE]
    existing_by_rank = {row["slot_rank"]: row for row in existing if row.get("slot_rank")}

    all_ranks = set(range(1, _SCORED_SLOTS + 1))
    free_ranks = sorted(all_ranks - existing_by_rank.keys())
    occupied_ranks_desc = sorted(existing_by_rank.keys(), reverse=True)

    target_ranks: list[int] = []
    target_ranks.extend(free_ranks)
    for r in occupied_ranks_desc:
        if len(target_ranks) >= len(codes):
            break
        target_ranks.append(r)
    target_ranks = sorted(target_ranks[:len(codes)])

    codes_to_deactivate = [existing_by_rank[r]["code"] for r in target_ranks if r in existing_by_rank]
    if codes_to_deactivate:
        deactivate_watchlist_codes(codes_to_deactivate)

    result = validate_codes_in_latest_ranking(codes)
    company_names = result["company_names"]
    selected_date = result["latest_date"] or str(date.today())

    rows = [
        {
            "code": code,
            "company_name": company_names.get(code, ""),
            "selected_date": selected_date,
            "source": "LINE",
            "slot_rank": rank,
        }
        for code, rank in zip(codes, target_ranks)
    ]
    upsert_watchlist_entries(rows)
    logger.info("watchlist 上書き完了（LINE）: %s (スロット=%s)", codes, target_ranks)
    return rows


def get_watchlist_status() -> dict:
    """
    現在アクティブな監視銘柄一覧（スコア順位スロット最大5件＋ストップ高枠）を返す。
    LINEの「監視リスト」コマンドへの応答に使う。

    Returns:
        dict: {"scored": [...], "stop_high": dict | None}
    """
    from db import get_active_watchlist

    rows = get_active_watchlist()
    scored = [r for r in rows if r.get("source") != _STOP_HIGH_SOURCE]
    stop_high = next((r for r in rows if r.get("source") == _STOP_HIGH_SOURCE), None)
    return {"scored": scored, "stop_high": stop_high}


def register_watchlist(codes: list[str], source: str = "LINE") -> list[dict]:
    """
    既存のアクティブ監視銘柄を全て無効化し、指定銘柄を is_active=1 で登録する。
    最大 _MAX_WATCH_CODES（5）件を超える場合は先頭から切り捨てる
    （--intraday の対象は最大5件のため、watchlist もそれに合わせる）。
    登録した銘柄の dict リストを返す。

    codes は4桁コードを想定するが、analysis_results 由来（source="RANKING"）は
    J-Quants の5桁表記（末尾0）のまま渡されることがあるため、5桁→4桁に正規化する
    （正規化しないと intraday_monitor.code_to_ticker() が誤ったティッカー
    "XXXXX0.T" を組み立て、5分足取得が常に失敗する）。
    """
    from db import deactivate_watchlist, upsert_watchlist_entries

    codes = [c[:-1] if len(c) == 5 and c.isdigit() and c.endswith("0") else c for c in codes]

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

    analysis_results.code は J-Quants の5桁表記（末尾0）のため、4桁に正規化して返す
    （正規化しないと intraday_monitor.code_to_ticker() が誤ったティッカーを組み立てる）。
    rank=0（ストップ高翌日継続候補、スコアに依存しない別枠）は対象外とする。
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
            "SELECT code FROM analysis_results WHERE date = ? AND rank >= 1 ORDER BY rank ASC LIMIT ?",
            (latest_date, limit),
        ).fetchall()
        conn.close()
        return [r[0][:-1] if len(r[0]) == 5 and r[0].isdigit() and r[0].endswith("0") else r[0] for r in rows]
    except Exception as e:
        logger.error("ランキング上位取得エラー: %s", e)
        return []
