"""
通知モジュール。ntfy.sh を優先し、未設定の場合は LINE にフォールバックする。
送信失敗は警告ログのみ — メイン処理は止めない。
"""

import logging

import requests

from src.config import (
    LINE_CHANNEL_ACCESS_TOKEN,
    LINE_USER_ID,
    NTFY_TOPIC,
    NTFY_URL,
)

log = logging.getLogger(__name__)

_LINE_API = "https://api.line.me/v2/bot/message/push"
_TIMEOUT  = 10


def _send_ntfy(message: str, title: str = "") -> bool:
    """ntfy.sh にメッセージを送信する（JSON API 使用）。"""
    if not NTFY_TOPIC:
        return False
    try:
        payload: dict = {"topic": NTFY_TOPIC, "message": message}
        if title:
            payload["title"] = title
        resp = requests.post(
            NTFY_URL,
            json=payload,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        log.warning("ntfy 通知失敗: %s", e)
        return False


def _send_line(message: str) -> bool:
    """LINE にメッセージを送信する（フォールバック）。"""
    if not LINE_CHANNEL_ACCESS_TOKEN or not LINE_USER_ID:
        return False
    try:
        resp = requests.post(
            _LINE_API,
            headers={
                "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "to": LINE_USER_ID,
                "messages": [{"type": "text", "text": message}],
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        log.warning("LINE 通知失敗: %s", e)
        return False


def send(message: str, dry_run: bool = False, title: str = "") -> bool:
    """ntfy.sh 優先で送信。未設定なら LINE にフォールバック。"""
    if dry_run:
        message = f"[DRY-RUN] {message}"

    if _send_ntfy(message, title=title):
        return True
    return _send_line(message)


def notify_scan_complete(candidates: list[dict], dry_run: bool = False) -> None:
    """スキャン完了通知。全候補をスコア順で送信する。"""
    total = len(candidates)
    lines = [f"候補 {total} 件"]
    for i, c in enumerate(candidates, 1):
        sym   = c.get("symbol") or c.get("Symbol") or ""
        name  = (c.get("symbol_name") or c.get("SymbolName") or "")[:8]
        price = c.get("current_price") or c.get("CurrentPrice") or 0
        score = c.get("score") or 0
        lines.append(f"{i:>2}. {sym} {name} {price:.0f}円 score:{score:.0f}")

    text = "\n".join(lines)
    chunk_size = 4000
    for i in range(0, len(text), chunk_size):
        send(text[i:i + chunk_size], dry_run=dry_run, title="寄り付き前スキャン完了")


def notify_pre_entry_alert(
    symbol: str,
    name: str,
    price: float,
    surge_score: float,
    surge_signal: str,
    entry_path: str,
    confirm_count: int,
    confirm_min: int,
    dry_run: bool = False,
) -> None:
    """エントリー直前アラート（surge確認中、あと1回でエントリー）。"""
    msg = (
        f"{name}({symbol}) {price:.0f}円\n"
        f"surge:{surge_score:.0f} ({surge_signal})\n"
        f"経路{entry_path}  確認 {confirm_count}/{confirm_min}回目"
    )
    send(msg, dry_run=dry_run, title="エントリー直前")


def notify_order_placed(symbol: str, name: str, price: float, qty: int, dry_run: bool = False) -> None:
    send(f"{name}({symbol}) {price:.0f}円 x {qty}株", dry_run=dry_run, title="買い注文")


def notify_filled(symbol: str, name: str, price: float, qty: int, dry_run: bool = False) -> None:
    send(f"{name}({symbol}) {price:.0f}円 x {qty}株", dry_run=dry_run, title="約定")


def notify_closed(symbol: str, name: str, price: float, pnl: float, reason: str, dry_run: bool = False) -> None:
    sign = "+" if pnl >= 0 else ""
    send(
        f"{name}({symbol}) {price:.0f}円  損益{sign}{pnl:.0f}円  [{reason}]",
        dry_run=dry_run,
        title="決済 WIN" if pnl >= 0 else "決済 LOSS",
    )


def notify_surge_candidate(
    symbol: str,
    name: str,
    current_price: float,
    score: float,
    surge_score: float,
    surge_signal: str,
    surge_score_delta: float,
    volume_spike_ratio: float,
    turnover_spike_ratio: float,
    price_change_1m: float,
    price_change_3m: float,
    price_change_5m: float,
    surge_reason: str,
    dry_run: bool = False,
) -> None:
    delta_str = f"{surge_score_delta:+.0f}" if surge_score_delta != 0 else "初回"
    msg = (
        f"【急騰候補】\n"
        f"銘柄: {symbol} {name}\n"
        f"現在値: {current_price:.0f}円\n"
        f"score: {score:.0f}  surge: {surge_score:.0f}({delta_str})\n"
        f"signal: {surge_signal}\n"
        f"出来高急増: {volume_spike_ratio:.1f}倍\n"
        f"売買代金急増: {turnover_spike_ratio:.1f}倍\n"
        f"価格変化: 1分 {price_change_1m:+.2f}% / 3分 {price_change_3m:+.2f}% / 5分 {price_change_5m:+.2f}%\n"
        f"理由: {surge_reason}"
    )
    send(msg, dry_run=dry_run)


_REASON_LABEL = {
    "TAKE_PROFIT":      "利確(RCI)",
    "TAKE_PROFIT_TRAIL":"利確(Trail)",
    "TAKE_PROFIT_LOCK": "利益ロック",
    "STOP_LOSS":        "損切り",
    "TIME_LIMIT":       "時間切れ",
    "MANUAL":           "手動",
}


def _build_daily_report(
    positions: list[dict],
    open_positions: list[dict],
    candidates_count: int,
    dry_run: bool,
) -> str:
    from datetime import date
    today = date.today().strftime("%Y/%m/%d")

    total     = len(positions)
    wins      = sum(1 for p in positions if (p.get("pnl") or 0) >= 0)
    total_pnl = sum((p.get("pnl") or 0) for p in positions)
    win_rate  = wins / total * 100 if total else 0.0
    pnl_sign  = "+" if total_pnl >= 0 else ""
    prefix    = "[DRY-RUN]\n" if dry_run else ""

    lines = [
        f"{prefix}日次レポート {today}",
        "-" * 22,
        f"取引数  : {total} 件",
        f"勝率    : {win_rate:.0f}% ({wins}勝{total - wins}敗)",
        f"損益合計: {pnl_sign}{total_pnl:,.0f} 円",
        f"候補銘柄: {candidates_count} 件（スキャン）",
    ]

    if positions:
        lines.append("-" * 22)
        for p in positions:
            pnl     = p.get("pnl") or 0
            pnl_pct = p.get("pnl_pct") or 0
            mark    = "[WIN]" if pnl >= 0 else "[LOSS]"
            s       = "+" if pnl >= 0 else ""
            reason  = _REASON_LABEL.get(p.get("close_reason") or "", p.get("close_reason") or "")
            name    = (p.get("symbol_name") or "")[:8]
            entry   = p.get("entry_price") or 0
            close   = p.get("close_price") or 0
            lines.append(
                f"{mark} {p['symbol']} {name}\n"
                f"  {entry:.0f}->{close:.0f}円  {s}{pnl_pct:.1f}%  {s}{pnl:,.0f}円\n"
                f"  [{reason}]"
            )

    if open_positions:
        lines.append("-" * 22)
        lines.append(f"[未決済] {len(open_positions)} 件")
        for p in open_positions:
            name = (p.get("symbol_name") or "")[:8]
            lines.append(f"  {p['symbol']} {name}  {p.get('entry_price', 0):.0f}円")

    return "\n".join(lines)


def notify_daily_report(
    positions: list[dict],
    open_positions: list[dict],
    candidates_count: int,
    dry_run: bool = False,
) -> None:
    text = _build_daily_report(positions, open_positions, candidates_count, dry_run)
    log.info("日次レポート:\n%s", text)
    chunk_size = 4000
    for i in range(0, len(text), chunk_size):
        send(text[i:i + chunk_size], dry_run=False, title="日次レポート")
