"""
EDINET の有価証券報告書等から PER/PBR/ROE 等のファンダメンタル指標を算出し、
fundamentals テーブルへ保存するためのデータを作る。

有報には「業績等の概要」（5年間の財務サマリー）という標準化された開示項目があり、
PER・ROE・自己資本比率・1株当たり配当額などを企業自身が算出済みの値として開示して
いるため、これを最優先で利用する（自分で price/EPS 等から再計算するより、開示済みの
値を使う方が信頼できる）。JP-GAAP/IFRSでタグ名の末尾に "IFRS" が付くかどうかが
異なるため、要素IDへの部分一致で両方を拾う。

fundamental_score.py（決算モメンタムスコア）と同じEDINET開示書類インデックス
（get_latest_financial_document）を再利用するため、追加のAPIリクエストは
書類のCSVダウンロード分のみで済む。

データ取得・解析に失敗した場合は None を返し、例外は外に投げない
（呼び出し元は fundamentals テーブルを更新せず、既存値または0点を維持する）。
"""

import logging
import sqlite3

import pandas as pd

from config import DB_PATH
from fundamental_score import download_financial_csv_frames, get_latest_financial_document

logger = logging.getLogger(__name__)

# 「業績等の概要」標準タグの部分一致ヒント（JP-GAAP/IFRS両方を候補に含む）
_TAG_HINTS: dict[str, list[str]] = {
    "per":                ["PriceEarningsRatio"],
    "roe":                ["RateOfReturnOnEquity"],
    "equity_ratio":       ["EquityToAssetRatio"],
    "bps":                ["NetAssetsPerShare"],
    "eps":                ["BasicEarningsPerShare", "BasicEarningsLossPerShare"],
    "dividend_per_share": ["DividendPaidPerShare"],
    "shares_outstanding": ["TotalNumberOfIssuedShares"],
    "net_income":         ["NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent"],
    "sales":              ["NetSales", "OperatingRevenue1"],
    "operating_profit":   ["OperatingIncome", "OperatingProfitLoss"],
}
_CURRENT_PERIOD_HINTS = ("CurrentYearDuration", "CurrentYearInstant", "CurrentYTDDuration")

# 自己資本比率・ROEは「100%を超える／極端すぎる値」が出た場合、その特定タグの
# 実データ品質問題（提出企業側のXBRLスケール誤り等）と判断して棄却する妥当性範囲。
_PERCENT_BOUNDS = {
    "roe":          (-300.0, 300.0),
    "equity_ratio": (-20.0, 100.0),
}


def _candidate_values(df: pd.DataFrame, hints: list[str]) -> list[float]:
    """指定ヒントに一致する「業績等の概要」要素の値を、ファイル順（連結優先）で返す"""
    if "要素ID" not in df.columns or "値" not in df.columns:
        return []
    ids = df["要素ID"].astype(str)
    is_summary = ids.str.contains("SummaryOfBusinessResults", na=False)
    values: list[float] = []
    for hint in hints:
        sub = df[is_summary & ids.str.contains(hint, na=False)]
        if sub.empty:
            continue
        if "コンテキストID" in df.columns and len(sub) > 1:
            ctx = sub["コンテキストID"].astype(str)
            preferred = sub[ctx.str.contains("|".join(_CURRENT_PERIOD_HINTS), regex=True, na=False)]
            if not preferred.empty:
                sub = preferred
        for raw in sub["値"]:
            try:
                values.append(float(str(raw).replace(",", "")))
            except (ValueError, TypeError):
                continue
    return values


def _extract_tag(frames: list[pd.DataFrame], hints: list[str]) -> float | None:
    """
    frames（複数CSV）から「業績等の概要（SummaryOfBusinessResults）」かつ
    指定ヒントを含む要素IDの最新期間の値を探して返す。見つからなければ None。
    """
    for df in frames:
        values = _candidate_values(df, hints)
        if values:
            return values[0]
    return None


def _extract_percent_tag(frames: list[pd.DataFrame], hints: list[str], bound_key: str) -> float | None:
    """
    ROE・自己資本比率など「%」のタグを抽出する。EDINET側のXBRLスケール表記の
    揺れ（小数比率 0.748 のまま out / 既にパーセント化済み out 等が混在する）に
    対応するため、絶対値が小さい値は ×100 してパーセントに正規化し、妥当な範囲
    （_PERCENT_BOUNDS）を超える値は提出企業側のデータ品質問題と判断して棄却し、
    次の候補を試す。すべて棄却された場合は None。
    """
    low, high = _PERCENT_BOUNDS[bound_key]
    for df in frames:
        for raw in _candidate_values(df, hints):
            value = raw * 100 if abs(raw) < 5 else raw
            if low <= value <= high:
                return round(value, 2)
    return None


def _get_latest_close(code: str) -> float | None:
    """daily_quotes から直近終値を取得する（PBR・配当利回り・時価総額の算出用）"""
    code_5digit = f"{code}0" if len(code) == 4 else code
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query(
            "SELECT close FROM daily_quotes WHERE code IN (?, ?) AND close IS NOT NULL "
            "ORDER BY date DESC LIMIT 1",
            conn, params=(code, code_5digit),
        )
    except Exception:
        return None
    finally:
        conn.close()
    if df.empty:
        return None
    return float(df.iloc[0]["close"])


def compute_fundamentals(code: str) -> dict | None:
    """
    指定銘柄のファンダメンタル指標（PER/PBR/ROE/自己資本比率/営業利益率等）を
    EDINETの直近決算書類（有報/四半期/半期報告書）から算出する。
    取得・解析に失敗した場合、または何も算出できなかった場合は None を返す。
    """
    try:
        doc = get_latest_financial_document(code)
    except Exception as e:
        logger.warning("銘柄 %s: EDINET開示書類取得に失敗したためファンダメンタル算出をスキップ: %s", code, e)
        return None

    if doc is None:
        logger.info("銘柄 %s: EDINET開示書類が見つからないためファンダメンタル算出をスキップ", code)
        return None

    frames = download_financial_csv_frames(doc["docID"])
    if not frames:
        logger.info("銘柄 %s: EDINET CSVが取得できないためファンダメンタル算出をスキップ", code)
        return None

    values = {
        key: _extract_tag(frames, hints)
        for key, hints in _TAG_HINTS.items()
        if key not in _PERCENT_BOUNDS
    }
    for key in _PERCENT_BOUNDS:
        values[key] = _extract_percent_tag(frames, _TAG_HINTS[key], key)
    price = _get_latest_close(code)

    per = values["per"]
    if per is None and price and values["eps"] and values["eps"] > 0:
        per = round(price / values["eps"], 2)

    pbr = round(price / values["bps"], 2) if (price and values["bps"] and values["bps"] > 0) else None

    dividend_yield = None
    if values["dividend_per_share"] and price:
        dividend_yield = round(values["dividend_per_share"] / price * 100, 2)

    market_cap = None
    if price and values["shares_outstanding"]:
        market_cap = round(price * values["shares_outstanding"], 0)

    operating_margin = None
    if values["operating_profit"] and values["sales"]:
        operating_margin = round(values["operating_profit"] / values["sales"] * 100, 2)

    result = {
        "code":             code,
        "market_cap":       market_cap,
        "per":              round(per, 2) if per is not None else None,
        "pbr":              pbr,
        "roe":              values["roe"],
        "equity_ratio":     values["equity_ratio"],
        "operating_margin": operating_margin,
        "sales":            values["sales"],
        "operating_profit": values["operating_profit"],
        "eps":              values["eps"],
        "dividend_yield":   dividend_yield,
    }

    if all(v is None for k, v in result.items() if k != "code"):
        logger.info("銘柄 %s: ファンダメンタル指標を算出できるデータがありませんでした", code)
        return None

    return result
