"""
取引終了後の日次監視レポート作成。

当日（または指定日）の trade_signals を銘柄ごとに集計し、
ENTRY/WATCH/TAKE_PROFIT/STOP_LOSS の回数、最大含み益・含み損、
最終シグナルとその判定理由をまとめる。
"""

import logging
import sqlite3

import pandas as pd

from config import DB_PATH

logger = logging.getLogger(__name__)


def build_daily_report(target_date: str) -> pd.DataFrame:
    """
    指定日（YYYY-MM-DD）の trade_signals を銘柄ごとに集計してレポート用
    DataFrame を返す。対象日のデータがなければ空の DataFrame を返す。
    """
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT * FROM trade_signals WHERE signal_datetime LIKE ? ORDER BY code, signal_datetime",
        conn, params=(f"{target_date}%",),
    )
    conn.close()

    if df.empty:
        logger.warning("日次監視レポート: %s のデータがありません", target_date)
        return pd.DataFrame()

    from db import get_company_name

    rows = []
    for code, grp in df.groupby("code"):
        grp = grp.sort_values("signal_datetime")
        last = grp.iloc[-1]
        signal_counts = grp["signal"].value_counts()

        rows.append({
            "code":              code,
            "company_name":      get_company_name(code) or "",
            "entry_count":       int(signal_counts.get("ENTRY", 0)),
            "watch_count":       int(signal_counts.get("WATCH", 0)),
            "take_profit_count": int(signal_counts.get("TAKE_PROFIT", 0)),
            "stop_loss_count":   int(signal_counts.get("STOP_LOSS", 0)),
            "max_profit_pct":    round(float(grp["profit_pct"].max()), 2),
            "max_loss_pct":      round(float(grp["profit_pct"].min()), 2),
            "last_signal":       last["signal"],
            "last_reason":       last["reason"],
        })

    logger.info("日次監視レポート作成: %d 銘柄", len(rows))
    return pd.DataFrame(rows)
