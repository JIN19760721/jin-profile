import logging
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

OUTPUT_DIR = Path("output")
OUTPUT_PATH = OUTPUT_DIR / "realtime_candidates.csv"

# CSV に出力する列（順序固定）
COLUMNS = [
    "Symbol",
    "SymbolName",
    "ExchangeName",
    "CategoryName",
    "CurrentPrice",
    "ChangePercentage",
    "TradingVolume",
    "Turnover",
    "RapidTradePercentage",
    "RapidPaymentPercentage",
    "TickCount",
    "score",
    "reasons",
    "predicted_change_pct",
    "momentum_basis",
    "fetched_at",
]


def export_csv(
    candidates: list[dict],
    path: Path = OUTPUT_PATH,
) -> Path:
    """
    候補銘柄リストを CSV に出力する。

    Excel で直接開けるよう BOM 付き UTF-8 (utf-8-sig) で書き出す。
    """
    OUTPUT_DIR.mkdir(exist_ok=True)
    df = pd.DataFrame(candidates)

    # 定義済み列のみ抽出（存在しない列は空欄）
    for col in COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[COLUMNS]

    df.to_csv(path, index=False, encoding="utf-8-sig")
    log.info("CSV 出力完了: %s (%d 件)", path.resolve(), len(df))
    return path
