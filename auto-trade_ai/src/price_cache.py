"""
インメモリ板価格キャッシュ。

trade_engine が 60 秒ポーリングで /board から取得した価格を蓄積し、
surge_score の価格加速計算 (C項目) と check_rci_overbought の
yfinance 1 分足データの代替として使う。
"""

_MAX_LEN: int = 12  # 最大 12 エントリー（約 12 分分）保持

_prices: dict[str, list[float]] = {}


def update(symbol: str, price: float) -> None:
    """板価格を追加する。"""
    if price <= 0:
        return
    if symbol not in _prices:
        _prices[symbol] = []
    hist = _prices[symbol]
    hist.append(price)
    if len(hist) > _MAX_LEN:
        del hist[0]


def get(symbol: str) -> list[float]:
    """蓄積済みの価格リストを返す（古い順）。"""
    return list(_prices.get(symbol, []))


def clear() -> None:
    """全キャッシュをクリアする（テスト用）。"""
    _prices.clear()
