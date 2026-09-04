"""
エントリー価格の決定ロジック。

entry_mode:
  - first_close: 当日最初の5分足の終値をエントリー価格とする
  - manual:       entry_prices.csv (code, entry_price) から読み込む
"""

import csv
import logging

from config import BASE_DIR

logger = logging.getLogger(__name__)

ENTRY_PRICES_CSV = BASE_DIR / "entry_prices.csv"


def get_entry_prices(
    codes: list[str],
    entry_mode: str,
    first_closes: dict[str, float] | None = None,
) -> dict[str, float]:
    """
    entry_mode に応じて銘柄ごとのエントリー価格を返す。
    買値が決定できない銘柄は結果に含めない（呼び出し側でスキップ扱いになる）。
    """
    if entry_mode == "first_close":
        return {code: price for code, price in (first_closes or {}).items() if code in codes}

    if entry_mode == "manual":
        return _load_manual_entry_prices(codes)

    raise ValueError(f"不明な entry_mode です: {entry_mode}")


def _load_manual_entry_prices(codes: list[str]) -> dict[str, float]:
    if not ENTRY_PRICES_CSV.exists():
        raise FileNotFoundError(
            f"entry_prices.csv が見つかりません: {ENTRY_PRICES_CSV}\n"
            "manual モードを使う場合は以下の形式の CSV を配置してください。\n"
            "code,entry_price\n7203,2500\n3778,4200"
        )

    prices: dict[str, float] = {}
    with open(ENTRY_PRICES_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("code") or "").strip()
            price_raw = (row.get("entry_price") or "").strip()
            if not code or not price_raw:
                continue
            try:
                prices[code] = float(price_raw)
            except ValueError:
                logger.warning("entry_prices.csv: 銘柄 %s の entry_price が不正です: %s", code, price_raw)

    result: dict[str, float] = {}
    for code in codes:
        if code in prices:
            result[code] = prices[code]
        else:
            logger.warning("銘柄 %s: entry_prices.csv に買値がありません。スキップ", code)

    return result
