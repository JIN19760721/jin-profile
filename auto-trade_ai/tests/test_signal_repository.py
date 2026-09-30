"""
V2設計書 Phase0: signal_repository のユニットテスト。

signal_history の状態遷移・重複防止、candidate_outcomes の見送り候補追跡を検証する。
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
from src import signal_repository as sr


def _fresh_db() -> Path:
    """一時DBに切り替える。db.pyの各関数は `db_path: Path = DB_PATH` を
    モジュール読み込み時に束縛しているため、config.DB_PATH書き換え後に
    db モジュールを reload してデフォルト値を再束縛する必要がある。
    """
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


def test_signal_transition_creates_row_on_first_sighting():
    tmp, orig = _fresh_db()
    try:
        sr.record_signal_transition("1234", 100.0, "PRE_SURGE_SETUP")
        conn = sqlite3.connect(tmp)
        rows = conn.execute("SELECT previous_signal, current_signal FROM signal_history").fetchall()
        conn.close()
        assert rows == [(None, "PRE_SURGE_SETUP")]
    finally:
        _cleanup(tmp, orig)


def test_signal_transition_dedupes_same_state():
    tmp, orig = _fresh_db()
    try:
        sr.record_signal_transition("1234", 100.0, "PRE_SURGE_SETUP")
        sr.record_signal_transition("1234", 100.5, "PRE_SURGE_SETUP")
        sr.record_signal_transition("1234", 100.7, "PRE_SURGE_SETUP")
        conn = sqlite3.connect(tmp)
        n = conn.execute("SELECT COUNT(*) FROM signal_history").fetchone()[0]
        conn.close()
        assert n == 1, f"同一状態が重複保存されている: {n}件"
    finally:
        _cleanup(tmp, orig)


def test_signal_transition_records_on_state_change():
    tmp, orig = _fresh_db()
    try:
        sr.record_signal_transition("1234", 100.0, "PRE_SURGE_SETUP")
        sr.record_signal_transition("1234", 101.0, "SURGE_WATCH")
        conn = sqlite3.connect(tmp)
        rows = conn.execute(
            "SELECT previous_signal, current_signal FROM signal_history ORDER BY id"
        ).fetchall()
        conn.close()
        assert rows == [(None, "PRE_SURGE_SETUP"), ("PRE_SURGE_SETUP", "SURGE_WATCH")]
    finally:
        _cleanup(tmp, orig)


def test_record_entry_decision_always_inserts():
    tmp, orig = _fresh_db()
    try:
        sr.record_entry_decision(
            "1234", 100.0, surge_score=80, one_hour_trend="UP",
            claude_result="OK", claude_reason="test", entry_allowed=True, no_entry_reason=None,
        )
        sr.record_entry_decision(
            "1234", 100.0, surge_score=80, one_hour_trend="UP",
            claude_result="OK", claude_reason="test", entry_allowed=True, no_entry_reason=None,
        )
        conn = sqlite3.connect(tmp)
        n = conn.execute("SELECT COUNT(*) FROM signal_history").fetchone()[0]
        conn.close()
        assert n == 2, "エントリー判断イベントは重複防止の対象外であるべき"
    finally:
        _cleanup(tmp, orig)


def test_candidate_outcome_tracks_no_entry_candidates():
    tmp, orig = _fresh_db()
    try:
        cid = sr.record_candidate("5678", 500.0, "PRE_SURGE_SETUP", entered=False, no_entry_reason="RISK_NG")
        assert cid is not None
        conn = sqlite3.connect(tmp)
        row = conn.execute(
            "SELECT entered, no_entry_reason FROM candidate_outcomes WHERE candidate_id=?", (cid,)
        ).fetchone()
        conn.close()
        assert row == (0, "RISK_NG")
    finally:
        _cleanup(tmp, orig)


def test_update_candidate_prices_tracks_max_min():
    tmp, orig = _fresh_db()
    try:
        sr.record_candidate("5678", 500.0, "PRE_SURGE_SETUP", entered=False, no_entry_reason="RISK_NG")
        sr.update_candidate_prices("5678", 510.0)
        sr.update_candidate_prices("5678", 495.0)
        conn = sqlite3.connect(tmp)
        row = conn.execute(
            "SELECT max_price, min_price FROM candidate_outcomes WHERE symbol=?", ("5678",)
        ).fetchone()
        conn.close()
        assert row == (510.0, 495.0)
    finally:
        _cleanup(tmp, orig)


if __name__ == "__main__":
    test_signal_transition_creates_row_on_first_sighting()
    test_signal_transition_dedupes_same_state()
    test_signal_transition_records_on_state_change()
    test_record_entry_decision_always_inserts()
    test_candidate_outcome_tracks_no_entry_candidates()
    test_update_candidate_prices_tracks_max_min()
    print("\n[OK] 全テスト通過")
