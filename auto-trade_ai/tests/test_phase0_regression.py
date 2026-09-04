"""
V2設計書 Phase0 回帰テスト。

Phase0（観測基盤の追加）導入前後で、経路Dのエントリー判定結果が
一切変わらないことを保証する。is_pathd_entry_candidate() は既存の
list内包表記の条件をそのまま抽出した純粋関数であり、判定内容は
従来と完全に同一であることをここで固定する。
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.trade_engine import is_pathd_entry_candidate

_BASE = dict(
    surge_signal="PRE_SURGE_SETUP",
    volume_spike_ratio=3.0,
    pre_surge_confirm_count=2,
    reasons="出来高急増(10位) / 売買代金急増(10位)",
)


def _c(**overrides):
    return {**_BASE, **overrides}


def test_all_conditions_met_is_candidate():
    assert is_pathd_entry_candidate(_c()) is True


def test_not_pre_surge_setup_is_rejected():
    for signal in ("SURGE_WATCH", "SURGE_CANDIDATE", "SURGE_STRONG", "SURGE_FADE", "NO_SURGE", None, ""):
        assert is_pathd_entry_candidate(_c(surge_signal=signal)) is False


def test_volume_spike_below_threshold_is_rejected():
    assert is_pathd_entry_candidate(_c(volume_spike_ratio=2.4)) is False


def test_volume_spike_at_threshold_is_candidate():
    assert is_pathd_entry_candidate(_c(volume_spike_ratio=2.5)) is True


def test_confirm_count_below_threshold_is_rejected():
    assert is_pathd_entry_candidate(_c(pre_surge_confirm_count=1)) is False


def test_confirm_count_at_threshold_is_candidate():
    assert is_pathd_entry_candidate(_c(pre_surge_confirm_count=2)) is True


def test_price_change_ranking_overlap_is_rejected():
    assert is_pathd_entry_candidate(_c(reasons="値上がり率(3位) / 出来高急増(10位)")) is False


def test_missing_fields_default_to_rejected():
    assert is_pathd_entry_candidate({}) is False


def test_none_volume_spike_ratio_treated_as_zero():
    assert is_pathd_entry_candidate(_c(volume_spike_ratio=None)) is False


def test_none_reasons_does_not_crash():
    assert is_pathd_entry_candidate(_c(reasons=None)) is True


if __name__ == "__main__":
    test_all_conditions_met_is_candidate()
    test_not_pre_surge_setup_is_rejected()
    test_volume_spike_below_threshold_is_rejected()
    test_volume_spike_at_threshold_is_candidate()
    test_confirm_count_below_threshold_is_rejected()
    test_confirm_count_at_threshold_is_candidate()
    test_price_change_ranking_overlap_is_rejected()
    test_missing_fields_default_to_rejected()
    test_none_volume_spike_ratio_treated_as_zero()
    test_none_reasons_does_not_crash()
    print("\n[OK] 全テスト通過")
