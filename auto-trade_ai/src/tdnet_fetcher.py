"""
TDnet（適時開示情報閲覧サービス, https://www.release.tdnet.info/）から
日次の適時開示一覧を取得する。

kabuステーションAPI・EDINET APIのいずれとも無関係（公開HTMLページの取得のみ）。
公式APIは存在しないため、日次一覧ページ（I_list_XXX_YYYYMMDD.html）を取得して
パースする非公式な方法。個人利用・低頻度（寄り付き前フィルタから1日1回程度）を
前提とし、ページ構造の変更等で取得・パースに失敗しても呼び出し元を止めない
（フェイルオープン＝空の結果を返す）。
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

_LIST_URL = "https://www.release.tdnet.info/inbs/I_list_{page:03d}_{ymd}.html"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TIMEOUT = 10
_MAX_PAGES = 10  # 安全上限（1ページ100件 → 最大1000件/日）
_MAX_PREV_DAY_LOOKBACK = 4  # 連休対策（例: 月曜朝は金曜分まで遡る）

# 株価インパクトが小さく除外したい開示タイトルのキーワード（優先的にノイズ除外）
_NOISE_KEYWORDS = [
    "コーポレート・ガバナンス", "上場維持基準の適合状況", "議決権", "招集通知",
    "招集ご通知", "株主総会", "有価証券報告書の訂正", "内部統制", "独立役員",
    "適時開示体制",
]

# 株価インパクトが大きいと判断し抽出対象とする開示タイトルのキーワード
_SIGNAL_KEYWORDS = [
    "決算短信", "業績予想", "業績の修正", "上方修正", "下方修正",
    "配当予想", "配当の修正", "増配", "減配",
    "自己株式", "自社株", "自己株券",
    "特別損失", "特別利益", "減損損失", "特損",
    "業務提携", "資本提携", "資本業務提携", "買収", "子会社化",
    "株式分割", "株式併合", "公募増資", "第三者割当", "新株予約権",
    "上場廃止", "民事再生", "破産",
    "売出", "公開買付", "TOB",
    "災害", "地震",
]


def _fetch_page(target_date: date, page: int) -> str | None:
    url = _LIST_URL.format(page=page, ymd=target_date.strftime("%Y%m%d"))
    try:
        resp = requests.get(url, headers={"User-Agent": _USER_AGENT}, timeout=_TIMEOUT)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        resp.encoding = "utf-8"
        return resp.text
    except Exception as e:
        log.warning("TDnet 取得失敗 %s (page=%d): %s", target_date, page, e)
        return None


def _parse_page(html: str) -> tuple[list[dict], int]:
    """1ページ分をパースする。(行リスト, 全件数) を返す。"""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id="main-list-table")
    rows: list[dict] = []
    if table is not None:
        for tr in table.find_all("tr"):
            time_td  = tr.find("td", class_="kjTime")
            code_td  = tr.find("td", class_="kjCode")
            name_td  = tr.find("td", class_="kjName")
            title_td = tr.find("td", class_="kjTitle")
            if time_td is None or code_td is None or title_td is None:
                continue
            # kjCode は 4桁の証券コード + 種類コード1桁（普通株式=0）の5文字
            code_raw = code_td.get_text(strip=True)
            if len(code_raw) < 4:
                continue
            symbol = code_raw[:4]
            a = title_td.find("a")
            title = a.get_text(strip=True) if a else title_td.get_text(strip=True)
            rows.append({
                "time":   time_td.get_text(strip=True),
                "symbol": symbol,
                "name":   name_td.get_text(strip=True) if name_td else "",
                "title":  title,
            })

    total = 0
    m = re.search(r"全(\d+)件", html)
    if m:
        total = int(m.group(1))
    return rows, total


def _fetch_day(target_date: date) -> list[dict]:
    """指定日の開示一覧を全ページ取得する（データがない日は空リスト）。"""
    all_rows: list[dict] = []
    page = 1
    while page <= _MAX_PAGES:
        html = _fetch_page(target_date, page)
        if html is None:
            break
        rows, total = _parse_page(html)
        if not rows:
            break
        all_rows.extend(rows)
        if len(all_rows) >= total:
            break
        page += 1
    return all_rows


def _fetch_previous_trading_day_after_hours(reference: date, after_hour: int) -> list[dict]:
    """直近の（土日祝で開示が0件の日をスキップした）前営業日のうち、
    after_hour時以降（＝引け後）の開示のみを返す。"""
    for delta in range(1, _MAX_PREV_DAY_LOOKBACK + 1):
        d = reference - timedelta(days=delta)
        rows = _fetch_day(d)
        if rows:
            return [
                r for r in rows
                if r["time"] and int(r["time"].split(":")[0]) >= after_hour
            ]
    return []


def _is_signal(title: str) -> bool:
    if any(kw in title for kw in _NOISE_KEYWORDS):
        return False
    return any(kw in title for kw in _SIGNAL_KEYWORDS)


def fetch_recent_disclosures(
    reference: date | None = None, after_hour: int = 15
) -> dict[str, list[dict]]:
    """寄り付き前フィルタ向けに「当日分」+「前営業日の引け後(after_hour時以降)分」の
    開示を取得し、株価インパクトが大きいと判断される開示のみに絞り込んで返す。

    戻り値: {symbol: [{"time": ..., "title": ...}, ...]}（新しい順）。
    取得・パースに失敗した場合は空dict（フェイルオープン）。
    """
    today = reference or date.today()

    try:
        today_rows = _fetch_day(today)
    except Exception as e:
        log.warning("TDnet 当日分取得失敗: %s", e)
        today_rows = []

    try:
        prev_after_hours = _fetch_previous_trading_day_after_hours(today, after_hour)
    except Exception as e:
        log.warning("TDnet 前営業日分取得失敗: %s", e)
        prev_after_hours = []

    result: dict[str, list[dict]] = {}
    for r in today_rows + prev_after_hours:
        if not _is_signal(r["title"]):
            continue
        result.setdefault(r["symbol"], []).append({"time": r["time"], "title": r["title"]})

    log.info(
        "TDnet開示取得: 当日%d件 + 前営業日%d時以降%d件 → シグナル抽出後 %d銘柄",
        len(today_rows), after_hour, len(prev_after_hours), len(result),
    )
    return result
