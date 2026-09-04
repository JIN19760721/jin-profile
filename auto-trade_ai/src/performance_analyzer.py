"""
V2設計書 Phase0: 現行ロジック（経路D / v1_pathd）の成績集計。

`positions`（実際の約定履歴）と `candidate_outcomes` / `signal_history`
（Phase0観測データ）を集計し、Phase1以降の判断材料となる基準成績を出力する。
観測専用モジュールであり、売買判定には一切使用しない。
"""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from src import db
from src.config import DB_PATH

TIME_BUCKETS = [
    ("09:05-09:30", "09:05", "09:30"),
    ("09:30-10:30", "09:30", "10:30"),
    ("10:30-11:30", "10:30", "11:30"),
    ("12:30-13:00", "12:30", "13:00"),
    ("13:00-14:00", "13:00", "14:00"),
    ("14:00-15:20", "14:00", "15:20"),
]

SURGE_SCORE_BANDS = [
    ("70-79", 70, 80),
    ("80-84", 80, 85),
    ("85-89", 85, 90),
    ("90-94", 90, 95),
    ("95-100", 95, 101),
]

FIXED_STOP_LEVELS = [-0.5, -1.0, -1.5, -2.0]
FIXED_TARGET_LEVELS = [1.0, 2.0, 3.0, 4.0, 5.0]


def _connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _closed_positions(db_path: Path = DB_PATH, dry_run: bool | None = None) -> list[dict]:
    conn = _connect(db_path)
    try:
        sql = "SELECT * FROM positions WHERE status='CLOSED'"
        params: list = []
        if dry_run is not None:
            sql += " AND dry_run=?"
            params.append(int(dry_run))
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def _time_bucket(opened_at: str) -> str | None:
    try:
        t = datetime.strptime(opened_at, "%Y-%m-%d %H:%M:%S").strftime("%H:%M")
    except (ValueError, TypeError):
        return None
    for label, start, end in TIME_BUCKETS:
        if start <= t < end:
            return label
    return None


def _surge_band(score: float | None) -> str | None:
    if score is None:
        return None
    for label, lo, hi in SURGE_SCORE_BANDS:
        if lo <= score < hi:
            return label
    return None


def _basic_stats(trades: list[dict]) -> dict:
    n = len(trades)
    if n == 0:
        return {"trades": 0}

    pnls = [t["pnl"] or 0.0 for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_profit = sum(wins)
    gross_loss = -sum(losses)

    ordered = sorted(trades, key=lambda t: t.get("closed_at") or "")
    max_win_streak = max_loss_streak = cur_win = cur_loss = 0
    for t in ordered:
        if (t["pnl"] or 0.0) > 0:
            cur_win += 1
            cur_loss = 0
        else:
            cur_loss += 1
            cur_win = 0
        max_win_streak = max(max_win_streak, cur_win)
        max_loss_streak = max(max_loss_streak, cur_loss)

    hold_minutes = []
    for t in trades:
        try:
            o = datetime.strptime(t["opened_at"], "%Y-%m-%d %H:%M:%S")
            c = datetime.strptime(t["closed_at"], "%Y-%m-%d %H:%M:%S")
            hold_minutes.append((c - o).total_seconds() / 60)
        except (ValueError, TypeError):
            pass

    return {
        "trades": n,
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate_pct": round(len(wins) / n * 100, 1),
        "total_pnl": round(sum(pnls), 1),
        "avg_win": round(gross_profit / len(wins), 1) if wins else 0.0,
        "avg_loss": round(-gross_loss / len(losses), 1) if losses else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else None,
        "max_win": round(max(pnls), 1),
        "max_loss": round(min(pnls), 1),
        "max_win_streak": max_win_streak,
        "max_loss_streak": max_loss_streak,
        "avg_hold_minutes": round(sum(hold_minutes) / len(hold_minutes), 1) if hold_minutes else None,
    }


def _group_by(trades: list[dict], keyfunc) -> dict:
    groups: dict = defaultdict(list)
    for t in trades:
        k = keyfunc(t)
        if k is not None:
            groups[k].append(t)
    return {k: _basic_stats(v) for k, v in groups.items()}


def by_exit_reason(trades: list[dict]) -> dict:
    return _group_by(trades, lambda t: t.get("close_reason"))


def by_time_bucket(trades: list[dict]) -> dict:
    return _group_by(trades, lambda t: _time_bucket(t.get("opened_at") or ""))


def by_surge_score_band(trades: list[dict]) -> dict:
    return _group_by(trades, lambda t: _surge_band(t.get("entry_surge_score")))


def fixed_threshold_hit_rates(db_path: Path = DB_PATH) -> dict:
    """candidate_outcomes（Phase0観測）から、固定-2%/+5%到達前の
    -0.5/-1/-1.5/-2%・+1/+2/+3/+4/+5%到達率と先着内訳を集計する
    （tracking_done=1＝30分追跡完了の候補のみ対象）。
    """
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT max_upside_pct, max_downside_pct, first_touch"
            " FROM candidate_outcomes WHERE tracking_done=1"
        ).fetchall()
    finally:
        conn.close()

    n = len(rows)
    if n == 0:
        return {"candidates": 0}

    result: dict = {"candidates": n}
    for level in FIXED_STOP_LEVELS:
        hit = sum(1 for r in rows if (r["max_downside_pct"] or 0) <= level)
        result[f"reach_{level:+.1f}pct"] = round(hit / n * 100, 1)
    for level in FIXED_TARGET_LEVELS:
        hit = sum(1 for r in rows if (r["max_upside_pct"] or 0) >= level)
        result[f"reach_{level:+.1f}pct"] = round(hit / n * 100, 1)

    first_touch_counts: dict = defaultdict(int)
    for r in rows:
        first_touch_counts[r["first_touch"] or "NEITHER"] += 1
    result["first_touch_pct"] = {k: round(v / n * 100, 1) for k, v in first_touch_counts.items()}
    return result


def claude_ok_ng_comparison(db_path: Path = DB_PATH) -> dict:
    """candidate_outcomes から、Claude OK（entered=1）とClaude NG
    （no_entry_reasonが'LLM_NG:'始まり）候補のその後のMFE/MAEを比較する。
    """
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT entered, no_entry_reason, mfe_pct, mae_pct"
            " FROM candidate_outcomes WHERE tracking_done=1"
        ).fetchall()
    finally:
        conn.close()

    ok_rows = [r for r in rows if r["entered"]]
    ng_rows = [r for r in rows if not r["entered"] and (r["no_entry_reason"] or "").startswith("LLM_NG")]

    def _avg(rs, col):
        vals = [r[col] for r in rs if r[col] is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    return {
        "claude_ok": {
            "n": len(ok_rows),
            "avg_mfe_pct": _avg(ok_rows, "mfe_pct"),
            "avg_mae_pct": _avg(ok_rows, "mae_pct"),
        },
        "claude_ng": {
            "n": len(ng_rows),
            "avg_mfe_pct": _avg(ng_rows, "mfe_pct"),
            "avg_mae_pct": _avg(ng_rows, "mae_pct"),
        },
    }


def build_report(db_path: Path = DB_PATH, dry_run: bool | None = None) -> dict:
    trades = _closed_positions(db_path, dry_run)
    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "strategy_version": "v1_pathd",
        "overall": _basic_stats(trades),
        "by_exit_reason": by_exit_reason(trades),
        "by_time_bucket": by_time_bucket(trades),
        "by_surge_score_band": by_surge_score_band(trades),
        "fixed_threshold_hit_rates": fixed_threshold_hit_rates(db_path),
        "claude_ok_ng_comparison": claude_ok_ng_comparison(db_path),
    }


def save_snapshot(report: dict, db_path: Path = DB_PATH) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    db.save_performance_snapshot(
        today, report.get("strategy_version", "v1_pathd"),
        json.dumps(report, ensure_ascii=False), db_path=db_path,
    )


if __name__ == "__main__":
    r = build_report()
    print(json.dumps(r, ensure_ascii=False, indent=2))
