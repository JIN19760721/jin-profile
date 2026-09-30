import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
conn = sqlite3.connect("data/trades.db")
conn.row_factory = sqlite3.Row
today = "2026-08-13"

print("=== 本日の決済済みポジション ===")
rows = conn.execute(
    "SELECT symbol, symbol_name, entry_price, close_price, close_reason, pnl, pnl_pct, opened_at, closed_at, dry_run"
    " FROM positions WHERE status=? AND DATE(closed_at)=? ORDER BY closed_at",
    ("CLOSED", today),
).fetchall()
print(f"{len(rows)} 件")
for r in rows:
    print(dict(r))

print()
print("=== オープンポジション ===")
rows = conn.execute(
    "SELECT symbol, symbol_name, qty, entry_price, status, opened_at, dry_run"
    " FROM positions WHERE status=? AND DATE(opened_at)=?",
    ("OPEN", today),
).fetchall()
print(f"{len(rows)} 件")
for r in rows:
    print(dict(r))

print()
print("=== 本日の注文 ===")
rows = conn.execute(
    "SELECT order_id, symbol, symbol_name, side, qty, price, status, ordered_at, dry_run"
    " FROM orders WHERE DATE(ordered_at)=? ORDER BY ordered_at",
    (today,),
).fetchall()
print(f"{len(rows)} 件")
for r in rows:
    print(dict(r))

print()
print("=== 日次サマリー ===")
rows = conn.execute("SELECT * FROM daily_summary WHERE date=?", (today,)).fetchall()
for r in rows:
    print(dict(r))

print()
print("=== surge_scores 本日上位 ===")
try:
    rows = conn.execute(
        "SELECT symbol, surge_score, surge_signal, surge_reason,"
        " volume_spike_ratio, turnover_spike_ratio, recorded_at"
        " FROM surge_scores WHERE DATE(recorded_at)=? ORDER BY surge_score DESC LIMIT 15",
        (today,),
    ).fetchall()
    print(f"{len(rows)} 件")
    for r in rows:
        print(dict(r))
except Exception as e:
    print(f"surge_scores テーブルなし or エラー: {e}")

conn.close()
