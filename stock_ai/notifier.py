"""
買いエントリー候補（entry_candidate）の変化検知・通知ロジック。

既存の signal（STAY/WATCH/WATCH_STRONG/TAKE_PROFIT/STOP_LOSS/ENTRY＝初回監視
開始通知）の通知ロジック（main.py 内）とは完全に別管理。
entry_candidate（ENTRY/WATCH/NO_ENTRY＝買いエントリー候補判定）の変化検知と
通知判定のみを扱う。実際のLINE送信は line_notify.send_line_message を使う。
"""

import logging

logger = logging.getLogger(__name__)

# entry_candidate の「上昇」遷移のみイベント（changed_flag=True）として扱う。
# 同一継続・降格（ENTRY→WATCH 等）はイベントにしない。
_UPGRADE_TRANSITIONS = {
    ("NO_ENTRY", "WATCH"),
    ("WATCH", "ENTRY"),
    ("NO_ENTRY", "ENTRY"),
}


def compute_entry_candidate_changed_flag(previous_entry_candidate: str | None, current_entry_candidate: str) -> bool:
    """
    entry_candidate の変化をイベントとして扱うかどうかを判定する。
    - 初回で ENTRY: True
    - NO_ENTRY→WATCH / WATCH→ENTRY / NO_ENTRY→ENTRY: True
    - それ以外（同一継続、降格、初回でWATCH/NO_ENTRY 等）: False
    """
    if previous_entry_candidate is None:
        return current_entry_candidate == "ENTRY"
    return (previous_entry_candidate, current_entry_candidate) in _UPGRADE_TRANSITIONS


def should_notify_entry_candidate(current_entry_candidate: str, changed_flag: bool) -> bool:
    """entry_candidate=ENTRY かつ changed_flag=True の場合のみ通知する（WATCHは通知しない）"""
    return bool(changed_flag and current_entry_candidate == "ENTRY")


def build_entry_candidate_message(code: str, company_name: str | None, entry_score: int, entry_factors: str) -> str:
    label = f"{code} {company_name}" if company_name else code
    return (
        f"【買い候補ENTRY】\n"
        f"{label}\n\n"
        f"ENTRY_SCORE：{entry_score}\n\n"
        f"理由：\n{entry_factors}\n\n"
        f"注意：\nこれは自動売買ではなく、買い検討候補の通知です。"
    )


# ── final_action（BUY/WAIT/SELL）の変化検知・通知ロジック ──────────────
#
# 既存の signal / entry_candidate の通知ロジックとは完全に別管理。
# trade_decision.compute_final_action() が出した BUY/WAIT/SELL の変化のみを扱う。
# 自動売買は行わず、LINE通知による判断支援のみを行う。

def compute_final_action_changed_flag(previous_final_action: str | None, current_final_action: str) -> bool:
    """
    final_action の変化をイベントとして扱うかどうかを判定する。
    - 初回で BUY / SELL: True
    - WAIT→BUY / BUY→SELL / WAIT→SELL 等、BUY/SELLへ変化した場合: True
    - それ以外（同一継続、BUY→WAIT、SELL→WAIT、初回でWAIT 等）: False
    """
    return bool(current_final_action != previous_final_action and current_final_action in ("BUY", "SELL"))


def should_notify_final_action(
    current_final_action: str, changed_flag: bool, notify_buy: bool, notify_sell: bool
) -> bool:
    """final_action が BUY/SELL に変化（changed_flag=True）した場合のみ、対応する設定が
    有効な時に通知する（WAITは通知しない）"""
    if not changed_flag:
        return False
    if current_final_action == "BUY":
        return bool(notify_buy)
    if current_final_action == "SELL":
        return bool(notify_sell)
    return False


def build_final_action_message(
    code: str, company_name: str | None, final_action: str,
    current_price: float, entry_score: int, reason: str,
) -> str:
    label = f"{code} {company_name}" if company_name else code
    return (
        f"【売買判断】\n"
        f"{label}\n\n"
        f"{final_action}\n\n"
        f"現在値：{current_price}円\n"
        f"ENTRY_SCORE：{entry_score}\n"
        f"理由：\n{reason}\n\n"
        f"注意：\nこれは自動売買ではなく判断支援です。"
    )
