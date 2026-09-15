"""DB の内容を確認するユーティリティ。"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "trades.db"

if not DB_PATH.exists():
    print(f"DB が見つかりません: {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row


def show(title: str, sql: str, params=()):
    rows = conn.execute(sql, params).fetchall()
    print(f"\n{'=' * 60}")
    print(f"  {title}  ({len(rows)} 件)")
    print("=" * 60)
    if not rows:
        print("  (なし)")
        return
    keys = rows[0].keys()
    print("  " + "  |  ".join(f"{k}" for k in keys))
    print("  " + "-" * 56)
    for r in rows:
        print("  " + "  |  ".join(str(r[k]) for k in keys))


show("本日の候補銘柄 (daily_candidates)",
     "SELECT date, symbol, symbol_name, current_price, score, fetched_at "
     "FROM daily_candidates ORDER BY score DESC LIMIT 20")

show("注文一覧 (orders) — 直近20件",
     "SELECT order_id, symbol, side, qty, price, status, ordered_at, dry_run "
     "FROM orders ORDER BY created_at DESC LIMIT 20")

show("ポジション (positions) — OPEN",
     "SELECT symbol, symbol_name, qty, entry_price, status, opened_at, dry_run "
     "FROM positions WHERE status='OPEN'")

show("ポジション (positions) — CLOSED 直近10件",
     "SELECT symbol, entry_price, close_price, close_reason, pnl, pnl_pct, closed_at, dry_run "
     "FROM positions WHERE status='CLOSED' ORDER BY closed_at DESC LIMIT 10")

show("日次サマリー (daily_summary)",
     "SELECT * FROM daily_summary ORDER BY date DESC LIMIT 5")

conn.close()
print()
