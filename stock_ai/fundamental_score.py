"""
EDINET API（無料）を使った決算モメンタムスコアの算出。

スコア構成（最大90点、各項目はデータが取得できない場合は加点せず0点扱い）:
  ① 決算発表から30日以内                +20点
  ② 業績予想の上方修正                   +30点
  ③ 営業利益YoY +50%以上                 +30点
  ④ 増配（記念配当・特別配当のみは除外） +10点

データ取得元について:
  EDINET は有価証券報告書・四半期報告書・半期報告書・臨時報告書など
  金融商品取引法に基づく開示書類を提供する。業績予想や配当予想の「修正」
  そのものは本来 TDnet（東証の適時開示）で開示されるものだが、重要性基準を
  超える業績予想の大幅な修正は金融商品取引法上も臨時報告書（docTypeCode=180）
  として EDINET に提出されるため、本実装はその開示内容（docDescription）の
  キーワード検索で①②④を判定し、③は最新の有報/四半期/半期報告書の
  XBRL付随CSVから営業利益のYoYを算出する。
  軽微な修正やTDnet限定の開示は検出できないため、ベストエフォートの実装である。

設計方針（将来 J-Quants 有料プランへの切り替えやすさ）:
  外部とのやり取りは _fetch_recent_documents() / _fetch_operating_income_yoy()
  の2箇所のみに閉じている。J-Quants 有料プランの決算APIに切り替える場合は
  この2関数の内部実装をJ-Quants呼び出しに置き換えるだけでよい。

エラーハンドリング:
  ネットワークエラー・APIキー未設定・パース失敗等、いかなる例外も
  compute_fundamental_score() の外には伝播させない。常に score=0 を含む
  辞書を返し、理由を reason リストとログに記録して処理を継続する。
"""

import logging
from datetime import date, datetime, timedelta
from io import BytesIO
from zipfile import ZipFile

import pandas as pd
import requests

from config import EDINET_API_KEY

logger = logging.getLogger(__name__)

EDINET_BASE_URL = "https://api.edinet-fsa.go.jp/api/v2"
_SEARCH_DAYS = 120       # 開示書類検索の遡及日数（直近の決算・臨時報告書を捕捉する目安）
_REQUEST_TIMEOUT = 20

# 報告書種別コード（EDINET API仕様書より）
_DOC_TYPE_FINANCIAL = {"120", "130", "140", "150", "160", "170"}  # 有報/四半期/半期（訂正含む）
_DOC_TYPE_EXTRAORDINARY = {"180", "190"}  # 臨時報告書（訂正含む）

_UPWARD_KEYWORDS = ("上方修正", "増額", "上回る")
_DOWNWARD_KEYWORDS = ("下方修正", "減額", "下回る")
_DIVIDEND_INCREASE_KEYWORDS = ("配当予想の修正", "配当の変更", "増配")
_MEMORIAL_DIVIDEND_KEYWORDS = ("記念配当", "特別配当")
_OPERATING_INCOME_ELEMENT_HINT = "OperatingIncome"

_doc_index_cache: dict[str, list[dict]] | None = None


def _empty_result(reason: str) -> dict:
    logger.info("決算モメンタムスコア: %s", reason)
    return {
        "score": 0,
        "earnings_within_30d": False,
        "upward_revision": False,
        "op_profit_growth_50": False,
        "dividend_increase": False,
        "reason": [reason],
    }


def compute_fundamental_score(code: str) -> dict:
    """
    指定銘柄の決算モメンタムスコア（0-90点）をEDINETの開示書類から算出する。
    取得・解析に失敗した場合は必ず score=0 を返し、例外を外に投げない。
    """
    if not EDINET_API_KEY:
        return _empty_result("EDINET_API_KEY未設定のため0点")

    try:
        docs = _fetch_recent_documents(code)
    except Exception as e:
        return _empty_result(f"銘柄 {code}: EDINET開示書類取得失敗のため0点 ({e})")

    if not docs:
        return _empty_result(f"銘柄 {code}: 直近{_SEARCH_DAYS}日間にEDINET開示書類が見つからないため0点")

    reasons: list[str] = []
    score = 0

    financial_docs = sorted(
        (d for d in docs if d.get("docTypeCode") in _DOC_TYPE_FINANCIAL),
        key=lambda d: d.get("submitDateTime", ""),
        reverse=True,
    )
    latest_financial = financial_docs[0] if financial_docs else None

    # ① 決算発表から30日以内
    earnings_within_30d = False
    if latest_financial:
        try:
            submitted = datetime.fromisoformat(latest_financial["submitDateTime"]).date()
            days_diff = (date.today() - submitted).days
            earnings_within_30d = 0 <= days_diff <= 30
            if earnings_within_30d:
                score += 20
                reasons.append(f"決算発表({submitted})から{days_diff}日以内")
        except Exception as e:
            reasons.append(f"決算発表日の判定に失敗: {e}")
    else:
        reasons.append("直近の決算書類（有報/四半期/半期報告書）が見つかりません")

    # ② 業績予想の上方修正
    upward_revision = False
    try:
        upward_revision = _check_upward_revision(docs, reasons)
        if upward_revision:
            score += 30
    except Exception as e:
        reasons.append(f"上方修正の判定に失敗: {e}")

    # ③ 営業利益YoY+50%以上
    op_profit_growth_50 = False
    if latest_financial:
        try:
            growth = _fetch_operating_income_yoy(latest_financial)
            if growth is None:
                reasons.append("営業利益YoYのデータが取得できませんでした")
            else:
                reasons.append(f"営業利益YoY {growth:.1f}%")
                if growth >= 50:
                    op_profit_growth_50 = True
                    score += 30
        except Exception as e:
            reasons.append(f"営業利益YoYの判定に失敗: {e}")

    # ④ 増配（記念配当・特別配当のみは除外）
    dividend_increase = False
    try:
        dividend_increase = _check_dividend_increase(docs, reasons)
        if dividend_increase:
            score += 10
    except Exception as e:
        reasons.append(f"増配の判定に失敗: {e}")

    if not reasons:
        reasons.append("該当する決算モメンタム要因なし")

    return {
        "score": min(score, 90),
        "earnings_within_30d": earnings_within_30d,
        "upward_revision": upward_revision,
        "op_profit_growth_50": op_profit_growth_50,
        "dividend_increase": dividend_increase,
        "reason": reasons,
    }


# ── EDINET 開示書類一覧の取得・インデックス化 ──────────────────────────


def _list_documents(date_str: str) -> list[dict]:
    """指定日にEDINETへ提出された開示書類一覧を返す（失敗時は例外を呼び出し元に伝播）"""
    resp = requests.get(
        f"{EDINET_BASE_URL}/documents.json",
        params={"date": date_str, "type": 2, "Subscription-Key": EDINET_API_KEY},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    return body.get("results") or []


def _get_doc_index() -> dict[str, list[dict]]:
    """
    直近 _SEARCH_DAYS 日分の開示書類一覧を銘柄コード（secCode）別にインデックス化する。
    全銘柄分を1回の走査で構築し、compute_fundamental_score() を何度呼んでも
    EDINETへのリクエストは（プロセス内で）1回の走査分だけに抑える。
    1日分の取得に失敗してもその日だけスキップし、全体は継続する。
    """
    global _doc_index_cache
    if _doc_index_cache is not None:
        return _doc_index_cache

    index: dict[str, list[dict]] = {}
    today = date.today()
    fetched_days = 0

    for i in range(_SEARCH_DAYS):
        d = today - timedelta(days=i)
        try:
            docs = _list_documents(str(d))
        except Exception as e:
            logger.warning("EDINET 開示書類一覧取得失敗 (%s): %s", d, e)
            continue

        fetched_days += 1
        for doc in docs:
            sec_code = (doc.get("secCode") or "").strip()
            if not sec_code:
                continue
            index.setdefault(sec_code, []).append(doc)
            if len(sec_code) == 5 and sec_code.endswith("0"):
                index.setdefault(sec_code[:-1], []).append(doc)

    logger.info(
        "EDINET 開示書類インデックス構築完了: %d 銘柄分（%d/%d 日分を走査）",
        len(index), fetched_days, _SEARCH_DAYS,
    )
    _doc_index_cache = index
    return index


def _fetch_recent_documents(code: str) -> list[dict]:
    """指定銘柄コードの直近開示書類一覧を返す（4桁/5桁コード両対応）"""
    index = _get_doc_index()
    code_5digit = code if len(code) == 5 else f"{code}0"
    return index.get(code) or index.get(code_5digit) or []


# ── 個別判定 ─────────────────────────────────────────────────


def _check_upward_revision(docs: list[dict], reasons: list[str]) -> bool:
    """臨時報告書の開示内容から業績予想の上方修正を検出する"""
    for doc in docs:
        if doc.get("docTypeCode") not in _DOC_TYPE_EXTRAORDINARY:
            continue
        desc = doc.get("docDescription") or ""
        if any(k in desc for k in _UPWARD_KEYWORDS) and not any(k in desc for k in _DOWNWARD_KEYWORDS):
            reasons.append(f"業績予想の上方修正を示す開示を検出: {desc}")
            return True
    return False


def _check_dividend_increase(docs: list[dict], reasons: list[str]) -> bool:
    """臨時報告書の開示内容から増配を検出する（記念配当・特別配当のみは除外）"""
    for doc in docs:
        if doc.get("docTypeCode") not in _DOC_TYPE_EXTRAORDINARY:
            continue
        desc = doc.get("docDescription") or ""
        if not any(k in desc for k in _DIVIDEND_INCREASE_KEYWORDS):
            continue
        if any(k in desc for k in _MEMORIAL_DIVIDEND_KEYWORDS) and "増配" not in desc:
            reasons.append(f"記念配当・特別配当のみのため増配扱いから除外: {desc}")
            continue
        reasons.append(f"増配を示す開示を検出: {desc}")
        return True
    return False


def _fetch_operating_income_yoy(doc: dict) -> float | None:
    """最新決算書類のXBRL付随CSVから営業利益のYoY成長率(%)を算出する。取得・解析失敗時はNone"""
    doc_id = doc.get("docID")
    if not doc_id:
        return None

    resp = requests.get(
        f"{EDINET_BASE_URL}/documents/{doc_id}",
        params={"type": 5, "Subscription-Key": EDINET_API_KEY},  # type=5: CSV(XBRL付随データ)
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    with ZipFile(BytesIO(resp.content)) as zf:
        for name in zf.namelist():
            if not name.endswith(".csv"):
                continue
            try:
                with zf.open(name) as f:
                    df = pd.read_csv(f, sep="\t", encoding="utf-16")
            except Exception:
                continue
            growth = _extract_operating_income_yoy(df)
            if growth is not None:
                return growth
    return None


def _extract_operating_income_yoy(df: pd.DataFrame) -> float | None:
    """EDINET CSV（要素ID/コンテキストID/値 列）から営業利益のYoY成長率(%)を抽出する"""
    if "要素ID" not in df.columns or "値" not in df.columns or "コンテキストID" not in df.columns:
        return None

    mask = df["要素ID"].astype(str).str.contains(_OPERATING_INCOME_ELEMENT_HINT, na=False)
    sub = df[mask]
    if sub.empty:
        return None

    context = sub["コンテキストID"].astype(str)
    current = sub[context.str.contains(r"CurrentYTDDuration|CurrentYearDuration|CurrentQuarterDuration", regex=True)]
    prior = sub[context.str.contains(r"Prior1YTDDuration|Prior1YearDuration|Prior1QuarterDuration", regex=True)]
    if current.empty or prior.empty:
        return None

    try:
        cur_val = float(str(current.iloc[0]["値"]).replace(",", ""))
        prior_val = float(str(prior.iloc[0]["値"]).replace(",", ""))
    except (ValueError, TypeError):
        return None

    if not prior_val:
        return None
    return (cur_val - prior_val) / abs(prior_val) * 100
