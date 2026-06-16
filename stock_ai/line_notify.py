"""
LINE Messaging API を使った通知。

LINE Notify は提供終了のため、Messaging API の push message で送信する。
"""

import logging

import requests

from config import LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID

logger = logging.getLogger(__name__)

LINE_MESSAGING_PUSH_URL = "https://api.line.me/v2/bot/message/push"


def send_line_message(message: str) -> bool:
    """
    LINE Messaging API でテキストメッセージを送信する。
    LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が未設定の場合はスキップしてログ出力する。
    送信失敗時も False を返すのみで、メイン処理は止めない。
    """
    if not LINE_CHANNEL_ACCESS_TOKEN or not LINE_USER_ID:
        logger.warning("LINE_CHANNEL_ACCESS_TOKEN または LINE_USER_ID が未設定のため通知をスキップします")
        return False

    try:
        res = requests.post(
            LINE_MESSAGING_PUSH_URL,
            headers={
                "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "to": LINE_USER_ID,
                "messages": [{"type": "text", "text": message}],
            },
            timeout=10,
        )
        if res.status_code == 200:
            logger.info("LINE通知送信成功")
            return True
        logger.error("LINE通知送信失敗: status=%s body=%s", res.status_code, res.text)
        return False
    except Exception as e:
        logger.error("LINE通知送信エラー: %s", e)
        return False
