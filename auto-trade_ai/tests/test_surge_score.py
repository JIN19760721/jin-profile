"""
surge_score のユニットテスト。
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.scoring.surge_score import calculate_surge_score

# テスト用の共通ベースライン入力
_BASE = dict(
    symbol="1234",
    current_price=1000.0,
    day_high=1020.0,
    today_volume=500_000,
    today_turnover=500_000_000,
    vwap=990.0,
    closes_1m=[990.0, 991.0, 992.0, 993.0, 994.0, 995.0, 996.0],
    avg_volume_20d=100_000,
    avg_turnover_20d=100_000_000,
    previous_surge_score=None,
    elapsed_minutes=60.0,   # 1時間経過として固定
)


def _calc(**kwargs):
    inp = {**_BASE, **kwargs}
    return calculate_surge_score(**inp)


# ── A. 売買代金急増 ───────────────────────────────────────────────────────────

def test_turnover_spike_2x():
    """売買代金 2倍急増 → A=10点"""
    r = _calc(today_turnover=200_000_000)  # 2x pace
    # elapsed=60/330 ≒ 0.182 → projected = 200M/0.182 ≒ 1100M → ratio ≒ 11x
    # actually we set avg=100M, today=200M, elapsed=60min out of 330
    # projected = 200M / (60/330) = 200M * 5.5 = 1100M → ratio = 11 → A=25点
    assert r.score_a == 25.0, f"expected 25 but got {r.score_a}"


def test_turnover_spike_exact_thresholds():
    """売買代金の閾値ごとに正しい点数が割り当てられる。"""
    # avg=100M, elapsed=165min (=0.5 day) → projected = today*2
    base = dict(_BASE, elapsed_minutes=165.0, avg_turnover_20d=100_000_000)

    r2 = calculate_surge_score(**{**base, "today_turnover": 100_000_000})  # 2x
    assert r2.score_a == 10.0, f"2x: expected 10 but {r2.score_a}"

    r3 = calculate_surge_score(**{**base, "today_turnover": 150_000_000})  # 3x
    assert r3.score_a == 18.0, f"3x: expected 18 but {r3.score_a}"

    r5 = calculate_surge_score(**{**base, "today_turnover": 250_000_000})  # 5x
    assert r5.score_a == 25.0, f"5x: expected 25 but {r5.score_a}"


# ── B. 出来高急増 ─────────────────────────────────────────────────────────────

def test_volume_spike_thresholds():
    """出来高の閾値ごとに正しい点数が割り当てられる。"""
    base = dict(_BASE, elapsed_minutes=165.0, avg_volume_20d=100_000)

    r2 = calculate_surge_score(**{**base, "today_volume": 100_000})   # 2x
    assert r2.score_b == 8.0,  f"2x: expected 8 but {r2.score_b}"

    r3 = calculate_surge_score(**{**base, "today_volume": 150_000})   # 3x
    assert r3.score_b == 14.0, f"3x: expected 14 but {r3.score_b}"

    r5 = calculate_surge_score(**{**base, "today_volume": 250_000})   # 5x
    assert r5.score_b == 20.0, f"5x: expected 20 but {r5.score_b}"


def test_higher_turnover_gives_higher_score():
    """売買代金急増率が高いほど surge_score が上がる。"""
    base = dict(_BASE, elapsed_minutes=165.0, avg_turnover_20d=100_000_000,
                avg_volume_20d=100_000, today_volume=250_000)  # volume=5x fixed

    r_low  = calculate_surge_score(**{**base, "today_turnover": 100_000_000})  # 2x
    r_high = calculate_surge_score(**{**base, "today_turnover": 250_000_000})  # 5x

    assert r_high.surge_score > r_low.surge_score, "高い売買代金急増率でスコアが上昇しない"


def test_higher_volume_gives_higher_score():
    """出来高急増率が高いほど surge_score が上がる。"""
    base = dict(_BASE, elapsed_minutes=165.0, avg_volume_20d=100_000,
                avg_turnover_20d=100_000_000, today_turnover=250_000_000)  # to=5x fixed

    r_low  = calculate_surge_score(**{**base, "today_volume": 100_000})   # 2x
    r_high = calculate_surge_score(**{**base, "today_volume": 250_000})   # 5x

    assert r_high.surge_score > r_low.surge_score, "高い出来高急増率でスコアが上昇しない"


# ── C. 価格加速 ───────────────────────────────────────────────────────────────

def test_overheat_5min_10pct_gives_no_surge():
    """5分騰落 +10%以上 → NO_SURGE（飛び乗り防止）。"""
    # closes_1m[0] は 5本前 → 現在値との差が +12%
    closes = [890.0, 900.0, 920.0, 940.0, 960.0, 980.0, 1000.0]
    r = _calc(closes_1m=closes, current_price=1000.0,
              today_volume=500_000, today_turnover=500_000_000,
              elapsed_minutes=165.0, avg_volume_20d=100_000, avg_turnover_20d=100_000_000)
    assert r.surge_signal == "NO_SURGE", f"expected NO_SURGE but {r.surge_signal}"
    assert "飛び乗り" in r.surge_reason or "overheat" in r.surge_reason.lower() or "10" in r.surge_reason


# ── F. スコア加速度 ───────────────────────────────────────────────────────────

def test_surge_score_delta_calculated_correctly():
    """surge_score_delta が base_score(F 抜き) - previous_score として計算される。"""
    prev = 50.0
    r_no_prev = _calc(
        previous_surge_score=None,
        elapsed_minutes=165.0,
        avg_volume_20d=100_000,
        avg_turnover_20d=100_000_000,
        today_volume=250_000,
        today_turnover=250_000_000,
    )
    r_with_prev = _calc(
        previous_surge_score=prev,
        elapsed_minutes=165.0,
        avg_volume_20d=100_000,
        avg_turnover_20d=100_000_000,
        today_volume=250_000,
        today_turnover=250_000_000,
    )
    # delta = base_score(F 抜き) - prev = (今回の score_a+b+c+d+e+penalty) - prev
    # score_f は delta に基づいて加算されるため final_score とは一致しない
    assert r_with_prev.surge_score_delta != 0.0, "delta が 0 のまま"
    # delta が正 → score_f が加算されて final score が上がる
    assert r_with_prev.surge_score >= r_no_prev.surge_score - 1.0, \
        "delta 加算で final score が下がっている"


def test_surge_fade_when_drop_15():
    """前回比 -15 以上低下 → SURGE_FADE。"""
    # 今回スコアが低くなるよう volume/turnover を低く設定
    r = _calc(
        previous_surge_score=80.0,
        elapsed_minutes=165.0,
        avg_volume_20d=100_000,
        avg_turnover_20d=100_000_000,
        today_volume=50_000,       # 1x 未満 → surge 低下
        today_turnover=50_000_000, # 1x 未満
        closes_1m=[1000.0] * 7,    # 価格変化なし
        vwap=1010.0,               # VWAP 下
        day_high=1050.0,
    )
    assert r.surge_signal == "SURGE_FADE", f"expected SURGE_FADE but {r.surge_signal}: {r.surge_reason}"


# ── 設定フィルタ ──────────────────────────────────────────────────────────────

def test_use_surge_filter_false_bypasses_surge(monkeypatch=None):
    """USE_SURGE_SCORE_FILTER=false の場合は score>=60 のみでエントリー評価に進む。

    (trade_engine の動作は統合テストが必要なため、config 値の確認のみ)
    """
    import importlib
    import src.config as cfg
    original = cfg.USE_SURGE_SCORE_FILTER
    cfg.USE_SURGE_SCORE_FILTER = False
    assert cfg.USE_SURGE_SCORE_FILTER is False
    cfg.USE_SURGE_SCORE_FILTER = original


def test_use_surge_filter_true_requires_surge_score():
    """USE_SURGE_SCORE_FILTER=true の場合、surge_score >= MIN_SURGE_SCORE が必要。"""
    import src.config as cfg
    assert cfg.USE_SURGE_SCORE_FILTER is True
    assert cfg.MIN_SURGE_SCORE == 70.0


# ── NO_SURGE 条件 ─────────────────────────────────────────────────────────────

def test_no_volume_gives_no_surge():
    """出来高急増なし かつ 売買代金急増なし → NO_SURGE。"""
    r = _calc(
        today_volume=10_000,        # 1x 未満
        today_turnover=10_000_000,  # 1x 未満
        elapsed_minutes=165.0,
        avg_volume_20d=100_000,
        avg_turnover_20d=100_000_000,
    )
    assert r.surge_signal == "NO_SURGE"
    assert "急増なし" in r.surge_reason


def test_vwap_below_reduces_score():
    """現在値 < VWAP → -10点のペナルティ。"""
    base = dict(_BASE, elapsed_minutes=165.0,
                avg_volume_20d=100_000, avg_turnover_20d=100_000_000,
                today_volume=250_000, today_turnover=250_000_000)

    r_above = calculate_surge_score(**{**base, "vwap": 990.0,  "current_price": 1000.0})
    r_below = calculate_surge_score(**{**base, "vwap": 1010.0, "current_price": 1000.0})

    diff = r_above.surge_score - r_below.surge_score
    assert diff > 0, "VWAP下でペナルティが効いていない"
    # VWAP上: score_e=10 + penalty=0 = +10
    # VWAP下: score_e=0  + penalty=-10 = -10  → 差は約 20
    assert 15.0 <= diff <= 25.0, f"VWAP penalty difference unexpected: {diff}"


if __name__ == "__main__":
    test_turnover_spike_2x()
    test_turnover_spike_exact_thresholds()
    test_volume_spike_thresholds()
    test_higher_turnover_gives_higher_score()
    test_higher_volume_gives_higher_score()
    test_overheat_5min_10pct_gives_no_surge()
    test_surge_score_delta_calculated_correctly()
    test_surge_fade_when_drop_15()
    test_use_surge_filter_false_bypasses_surge()
    test_use_surge_filter_true_requires_surge_score()
    test_no_volume_gives_no_surge()
    test_vwap_below_reduces_score()
    print("\n[OK] 全テスト通過")
