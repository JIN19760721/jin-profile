"""
V2設計書 Phase1（Shadow Mode）: trade_plan_repository のユニットテスト。

trade_plans への記録が観測専用として正しく動作すること
（1候補1回のみ記録、失敗しても例外を外に伝播しないこと）を検証する。
"""
import os
import sys
import importlib
import tempfile
import sqlite3
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import src.config as cfg
from src import db
from src import trade_plan_repository as tpr
from src.trade_plan import build_trade_plan


def _fresh_db() -> Path:
    tmp = Path(tempfile.mktemp(suffix=".db"))
    orig = cfg.DB_PATH
    cfg.DB_PATH = tmp
    importlib.reload(db)
    db.init_db(tmp)
    return tmp, orig


def _cleanup(tmp: Path, orig: Path) -> None:
    cfg.DB_PATH = orig
    importlib.reload(db)
    try:
        os.remove(tmp)
    except OSError:
        pass


def test_record_trade_plan_inserts_one_row():
    tmp, orig = _fresh_db()
    try:
        plan = build_trade_plan("1234", 1000.0)
        tpr.record_trade_plan("1234_20260101090000000000", "1234", plan)
        conn = sqlite3.connect(tmp)
        row = conn.execute(
            "SELECT symbol, stop_reason, target_reason, rr_verdict FROM trade_plans "
            "WHERE candidate_id=?", ("1234_20260101090000000000",),
        ).fetchone()
        conn.close()
        assert row == ("1234", "fallback_pct", "min_rr", "HIGH")
    finally:
        _cleanup(tmp, orig)


def test_record_trade_plan_does_not_duplicate_same_candidate_id():
    tmp, orig = _fresh_db()
    try:
        plan = build_trade_plan("1234", 1000.0)
        tpr.record_trade_plan("cid-1", "1234", plan)
        tpr.record_trade_plan("cid-1", "1234", plan)  # 同一candidate_idの再記録
        conn = sqlite3.connect(tmp)
        n = conn.execute("SELECT COUNT(*) FROM trade_plans WHERE candidate_id=?", ("cid-1",)).fetchone()[0]
        conn.close()
        assert n == 1, "同一candidate_idは1回しか記録されないべき（INSERT OR IGNORE）"
    finally:
        _cleanup(tmp, orig)


def test_record_trade_plan_swallows_exceptions():
    """DB未初期化（テーブル不在）でも例外を外へ伝播させない（観測専用の契約）。"""
    tmp = Path(tempfile.mktemp(suffix=".db"))
    orig = cfg.DB_PATH
    cfg.DB_PATH = tmp
    importlib.reload(db)
    # init_db を呼ばずテーブル未作成のまま記録を試みる
    try:
        plan = build_trade_plan("1234", 1000.0)
        tpr.record_trade_plan("cid-x", "1234", plan)  # 例外を投げずに終わるべき
    finally:
        cfg.DB_PATH = orig
        importlib.reload(db)
        try:
            os.remove(tmp)
        except OSError:
            pass


if __name__ == "__main__":
    test_record_trade_plan_inserts_one_row()
    test_record_trade_plan_does_not_duplicate_same_candidate_id()
    test_record_trade_plan_swallows_exceptions()
    print("\n[OK] 全テスト通過")
