"""
銘柄ごとの監視終了条件の判定、および監視状態（monitoring_status）の値定義。

終了条件:
  - TAKE_PROFIT が確定した
  - STOP_LOSS が確定した
  - 15:20 を過ぎた
  - 出来高が大きく減少した（volume_fading）
  - 手動で監視終了した（--stop-codes。main.py 側で個別に db.stop_monitoring を呼ぶ）

監視終了した銘柄は monitoring_status テーブルに記録され、次回以降の
--intraday 実行で対象銘柄から除外される。

--resume-codes（main.py 側で db.resume_monitoring を呼ぶ）で監視終了済みの
銘柄を再び監視対象に戻すことができる。
"""

import logging
from datetime import datetime, time as dt_time

logger = logging.getLogger(__name__)

_TIME_LIMIT = dt_time(15, 20)

STOP_REASON_TAKE_PROFIT = "TAKE_PROFIT"
STOP_REASON_STOP_LOSS = "STOP_LOSS"
STOP_REASON_TIME_LIMIT = "TIME_LIMIT"
STOP_REASON_VOLUME_DECLINE = "VOLUME_DECLINE"
STOP_REASON_MANUAL = "MANUAL"

STATUS_ACTIVE = "ACTIVE"
STATUS_STOPPED = "STOPPED"
STATUS_RESUMED = "RESUMED"


def evaluate_stop_condition(signal: str, signal_datetime_str: str, volume_fading: bool) -> str | None:
    """
    今回の判定結果が監視終了条件に該当するか判定し、該当すれば終了理由を返す。
    該当しなければ None（監視継続）。
    """
    if signal == "TAKE_PROFIT":
        return STOP_REASON_TAKE_PROFIT
    if signal == "STOP_LOSS":
        return STOP_REASON_STOP_LOSS

    current_time = datetime.strptime(signal_datetime_str, "%Y-%m-%d %H:%M:%S").time()
    if current_time > _TIME_LIMIT:
        return STOP_REASON_TIME_LIMIT

    if volume_fading:
        return STOP_REASON_VOLUME_DECLINE

    return None
