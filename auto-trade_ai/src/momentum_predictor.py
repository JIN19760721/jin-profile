"""
予想騰落率の近似値を算出するモジュール。

kabuステーションAPIで「予想騰落率」を直接取得するエンドポイントは存在しない。
そのため、APIから取得可能な以下の指標を組み合わせてモメンタムを推定し、
現在の騰落率に乗算することで予想値を近似する。

  使用指標:
    - ChangePercentage       : 現在の騰落率（モメンタムの基準値）
    - 売買代金急増ランキング順位  : 資金流入の強さ  (Type=7, 重み 0.50)
    - 売買高急増ランキング順位   : 出来高の勢い   (Type=6, 重み 0.50)

  算出式:
    rank_score(rank) = max(0.0, 1.0 - (rank - 1) / 100)
      → 1位=1.0、51位=0.5、100位≒0.0、ランキング外=0.0

    momentum_factor = 0.50 × rank_score(Type=7)
                    + 0.50 × rank_score(Type=6)
      → 範囲: 0.0〜1.0

    momentum_multiplier = 0.5 + momentum_factor
      → 範囲: 0.5〜1.5
        （全ランキング1位 → ×1.5、全ランキング外 → ×0.5）

    predicted_change_pct = ChangePercentage × momentum_multiplier

  解釈:
    全ランキングでトップ圏  → 現在変化率 × 1.5（勢い継続を予測）
    一部ランキングにのみ出現 → 現在変化率 × 0.5〜1.0（やや減速を予測）
    全ランキング外         → 現在変化率 × 0.5（モメンタム薄れを予測）

  注意:
    これは統計モデルではなくヒューリスティックな近似値です。
    投資判断の根拠として単独で使用しないでください。
"""

# ランキング種別の重み
_WEIGHTS: dict[int, float] = {
    7: 0.50,  # 売買代金急増（資金流入の強さ）
    6: 0.50,  # 売買高急増  （出来高の勢い）
}

# 順位スコアの分母（100位でスコア≒0になる）
_RANK_DENOMINATOR = 100.0

# momentum_multiplier の下限・上限
_MULTIPLIER_BASE = 0.5   # ランキング外の場合の係数
_MULTIPLIER_MAX  = 1.5   # 全ランキング1位の場合の係数


def _rank_score(rank: int | None) -> float:
    """ランキング順位を 0.0〜1.0 のスコアに変換する。ランキング外は 0.0。"""
    if rank is None:
        return 0.0
    return max(0.0, 1.0 - (rank - 1) / _RANK_DENOMINATOR)


def compute_predicted_change_pct(
    candidate: dict,
    rank_maps: dict[int, dict[str, int]],
) -> tuple[float, str]:
    """
    候補銘柄の予想騰落率（近似値）を計算する。

    Parameters
    ----------
    candidate : dict
        screener.merge_and_score が返す銘柄情報辞書。
        'Symbol' と 'ChangePercentage' が必要。
    rank_maps : dict[int, dict[str, int]]
        {ランキング種別: {Symbol: 順位}} の辞書。
        screener.merge_and_score 内で構築されたものを渡す。

    Returns
    -------
    (predicted_change_pct, basis_str)
        predicted_change_pct : float  予想騰落率（%）
        basis_str            : str    算出根拠の説明文字列
    """
    sym = candidate.get("Symbol", "")
    base_change = candidate.get("ChangePercentage") or 0.0

    # 各ランキング種別のスコアを重み付きで合算
    momentum_factor = 0.0
    basis_parts: list[str] = []

    for rank_type, weight in _WEIGHTS.items():
        rank = rank_maps.get(rank_type, {}).get(sym)
        score = _rank_score(rank)
        momentum_factor += weight * score
        if rank is not None:
            basis_parts.append(f"Type{rank_type}:{rank}位({score:.2f})")

    multiplier = _MULTIPLIER_BASE + momentum_factor  # 0.5〜1.5
    predicted = round(base_change * multiplier, 2)

    basis = (
        f"現在値変化率{base_change:+.2f}% × {multiplier:.2f}"
        + (f" [{', '.join(basis_parts)}]" if basis_parts else " [ランキング外]")
    )

    return predicted, basis
