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
