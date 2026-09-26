"""
V2設計書 Phase1（Shadow Mode）: trade_plan.py のユニットテスト。

STOP/TARGET候補の優先順位選択とRR境界値を固定する。build_trade_plan()は
純粋関数であり、DB・発注・リスク判定のいずれにも触れないことも確認する。
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.trade_plan import build_trade_plan, _pick_stop, _pick_target, _rr_verdict


# ─── STOP優先順位 ──────────────────────────────────────────────────────────

def test_stop_prefers_swing_low_over_everything():
    price, reason = _pick_stop(1000, swing_low=990, vwap=950, prev_day_high=900, atr=50)
    assert (price, reason) == (990, "recent_swing_low")


def test_stop_skips_invalid_swing_low_falls_to_vwap():
    # swing_low が entry 以上（データ不整合）なら候補として採用しない
    price, reason = _pick_stop(1000, swing_low=1010, vwap=970, prev_day_high=900, atr=50)
    assert (price, reason) == (970, "vwap")


def test_stop_falls_to_prev_day_high_when_no_swing_or_vwap():
    price, reason = _pick_stop(1000, swing_low=None, vwap=None, prev_day_high=980, atr=50)
    assert (price, reason) == (980, "prev_day_high_broken")


def test_stop_falls_to_atr_when_no_price_structure():
    price, reason = _pick_stop(1000, swing_low=None, vwap=None, prev_day_high=None, atr=10)
    assert (price, reason) == (1000 - 10 * 1.5, "atr")


def test_stop_falls_to_fixed_pct_when_nothing_available():
    price, reason = _pick_stop(1000, swing_low=None, vwap=None, prev_day_high=None, atr=None)
    assert (round(price, 2), reason) == (980.0, "fallback_pct")


# ─── TARGET優先順位 ─────────────────────────────────────────────────────────

def test_target_prefers_swing_high():
    price, reason = _pick_target(
        1000, swing_high=1050, day_high=1030, prev_day_high=1020, atr=10, risk_per_share=20,
    )
    assert (price, reason) == (1050, "recent_resistance")


def test_target_falls_to_lower_of_day_or_prev_high_above_entry():
    price, reason = _pick_target(
        1000, swing_high=None, day_high=1040, prev_day_high=1020, atr=10, risk_per_share=20,
    )
    assert (price, reason) == (1020, "day_or_prev_high")


def test_target_ignores_day_high_below_entry():
    price, reason = _pick_target(
        1000, swing_high=None, day_high=990, prev_day_high=None, atr=10, risk_per_share=20,
    )
    assert (price, reason) == (1000 + 10 * 2.0, "atr")


def test_target_falls_to_min_rr_when_no_price_structure_or_atr():
    price, reason = _pick_target(
        1000, swing_high=None, day_high=None, prev_day_high=None, atr=None, risk_per_share=20,
    )
    assert (price, reason) == (1000 + 20 * 2.0, "min_rr")


def test_target_skips_swing_high_too_close_falls_to_day_high():
    # entry=1000, 最低ライン0.5%=5円。swing_highのreward=3円は満たさないため次点へ。
    price, reason = _pick_target(
        1000, swing_high=1003, day_high=1020, prev_day_high=None, atr=10, risk_per_share=20,
    )
    assert (price, reason) == (1020, "day_or_prev_high")


def test_target_skips_day_high_too_close_falls_to_atr():
    price, reason = _pick_target(
        1000, swing_high=None, day_high=1002, prev_day_high=1001, atr=10, risk_per_share=20,
    )
    assert (price, reason) == (1000 + 10 * 2.0, "atr")


def test_target_reproduces_observed_low_rr_case_now_falls_to_atr():
    # 実運用で観測されたケース: entry=775, swing_high=777(reward=2円)は
    # 最低ライン(775*0.5%=3.875円)を満たさずATRへフォールバックするべき。
    price, reason = _pick_target(
        775, swing_high=777, day_high=None, prev_day_high=None, atr=8, risk_per_share=19,
    )
    assert reason == "atr"
    assert price == 775 + 8 * 2.0


def test_target_falls_to_fixed_pct_when_nothing_available():
    price, reason = _pick_target(
        1000, swing_high=None, day_high=None, prev_day_high=None, atr=None, risk_per_share=None,
    )
    assert (round(price, 2), reason) == (1050.0, "fallback_pct")


# ─── RR境界値 ────────────────────────────────────────────────────────────

def test_rr_verdict_boundaries():
    assert _rr_verdict(0.99) == "NO_ENTRY"
    assert _rr_verdict(1.00) == "NO_ENTRY_PRINCIPLE"
    assert _rr_verdict(1.49) == "NO_ENTRY_PRINCIPLE"
    assert _rr_verdict(1.50) == "WATCH"
    assert _rr_verdict(1.99) == "WATCH"
    assert _rr_verdict(2.00) == "HIGH"
    assert _rr_verdict(None) == "UNKNOWN"


# ─── build_trade_plan 統合 ───────────────────────────────────────────────

def test_build_trade_plan_all_fallback():
    """価格構造データが何もない場合: STOPは固定%フォールバック、TARGETは
    stop決定後に算出済みのrisk_per_shareを使ったmin_rr逆算が固定%より
    優先される（設計書のTARGET優先順位④が⑤より先）。
    """
    plan = build_trade_plan("1234", 1000.0)
    assert plan.stop_reason == "fallback_pct"
    assert plan.target_reason == "min_rr"
    assert round(plan.stop_price, 2) == 980.0
    assert round(plan.target_price, 2) == 1040.0
    assert round(plan.risk_reward_ratio, 4) == 2.0
    assert plan.rr_verdict == "HIGH"


def test_build_trade_plan_invalid_entry_price_returns_unknown():
    plan = build_trade_plan("1234", 0.0)
    assert plan.stop_price is None
    assert plan.target_price is None
    assert plan.rr_verdict == "UNKNOWN"


def test_build_trade_plan_uses_full_price_structure():
    plan = build_trade_plan(
        "1234", 1000.0,
        vwap=970, day_high=1030, swing_low=990, swing_high=1040,
        prev_day_high=980, atr=15,
    )
    assert plan.stop_reason == "recent_swing_low"
    assert plan.stop_price == 990
    assert plan.target_reason == "recent_resistance"
    assert plan.target_price == 1040


def test_build_trade_plan_never_produces_zero_or_negative_risk():
    # 万一STOP候補がentry以上になる不整合データでも、フォールバックへ強制されリスクが正になる
    plan = build_trade_plan("1234", 1000.0, swing_low=1000.0)
    assert plan.risk_per_share is not None and plan.risk_per_share > 0
    assert plan.stop_reason == "fallback_pct"


def test_trade_plan_module_has_no_side_effects():
    """build_trade_planはDB・発注・リスク判定のいずれにも触れない純粋関数であることを保証する。

    trade_plan.py が db/order_manager/risk_manager/entry_policy/trade_engine を
    importしていないことを確認することで、rr_verdictが構造的に売買判定へ
    接続し得ないことを裏付ける（設計書 P2 観測と売買の分離）。
    """
    import src.trade_plan as mod
    forbidden = ("src.db", "src.order_manager", "src.risk_manager", "src.entry_policy", "src.trade_engine")
    src_text = open(mod.__file__, encoding="utf-8").read()
    for name in forbidden:
        assert name not in src_text, f"trade_plan.py が {name} を参照している（純粋関数の契約違反）"


if __name__ == "__main__":
    test_stop_prefers_swing_low_over_everything()
    test_stop_skips_invalid_swing_low_falls_to_vwap()
    test_stop_falls_to_prev_day_high_when_no_swing_or_vwap()
    test_stop_falls_to_atr_when_no_price_structure()
    test_stop_falls_to_fixed_pct_when_nothing_available()
    test_target_prefers_swing_high()
    test_target_falls_to_lower_of_day_or_prev_high_above_entry()
    test_target_ignores_day_high_below_entry()
    test_target_falls_to_min_rr_when_no_price_structure_or_atr()
    test_target_skips_swing_high_too_close_falls_to_day_high()
    test_target_skips_day_high_too_close_falls_to_atr()
    test_target_reproduces_observed_low_rr_case_now_falls_to_atr()
    test_target_falls_to_fixed_pct_when_nothing_available()
    test_rr_verdict_boundaries()
    test_build_trade_plan_all_fallback()
    test_build_trade_plan_invalid_entry_price_returns_unknown()
    test_build_trade_plan_uses_full_price_structure()
    test_build_trade_plan_never_produces_zero_or_negative_risk()
    test_trade_plan_module_has_no_side_effects()
    print("\n[OK] 全テスト通過")
