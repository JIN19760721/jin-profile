"""
V2設計書 Phase1（Shadow Mode）回帰テスト。

Phase1（trade_plan/STOP/TARGET/RRの記録）導入によって、経路Dの実際の
ENTRY/EXIT判定が一切変わらないことを保証する。Phase0の
test_phase0_regression.py と同じ「record but never branch on」不変条件を
Phase1にも適用する: trade_engine.py の売買判定コード中に rr_verdict /
risk_reward_ratio が条件分岐（if/elif/while）として一切現れないこと、
FEATURE_RR_FILTER がtrade_engine.pyの名前空間に存在しない
（＝物理的にENTRYをブロックできない）ことを静的に確認する。
"""
import os
import re
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import src.trade_engine as te
from src.trade_plan import build_trade_plan


def test_feature_rr_filter_not_wired_into_trade_engine():
    """FEATURE_RR_FILTERはtrade_engine.pyにimportされていない（発注判定に接続不能）。"""
    assert not hasattr(te, "FEATURE_RR_FILTER")


def test_trade_engine_source_never_branches_on_rr():
    """trade_engine.py のソース中に rr_verdict / risk_reward_ratio を使った
    条件分岐（if/elif/while ... rr_verdict 等）が存在しないことを確認する。
    trade_plan/plan.rr_verdict への「参照」自体（記録のための代入・受け渡し）は
    許容するが、それを条件式で使ってはならない。
    """
    src_text = open(te.__file__, encoding="utf-8").read()
    forbidden_pattern = re.compile(
        r"^\s*(if|elif|while)\b.*\b(rr_verdict|risk_reward_ratio)\b", re.MULTILINE,
    )
    matches = forbidden_pattern.findall(src_text)
    assert not matches, f"rr_verdict/risk_reward_ratioが条件分岐に使われている: {matches}"


def test_default_rr_filter_flag_is_false():
    """settings.yamlのデフォルトはenable_rr_filter: false（Shadow Mode）のまま。"""
    from src.config import FEATURE_RR_FILTER
    assert FEATURE_RR_FILTER is False


def test_trade_plan_computation_cannot_raise_into_caller():
    """build_trade_plan自体が例外を投げないことを再確認する（trade_engine.py側の
    try/exceptに頼らずとも、純粋関数としてどんな入力でも安全であるべき）。
    """
    build_trade_plan("0000", 100.0)  # 全てNone（フォールバックのみ）
    build_trade_plan("0000", -1.0)   # 不正なentry_price


if __name__ == "__main__":
    test_feature_rr_filter_not_wired_into_trade_engine()
    test_trade_engine_source_never_branches_on_rr()
    test_default_rr_filter_flag_is_false()
    test_trade_plan_computation_cannot_raise_into_caller()
    print("\n[OK] 全テスト通過")
