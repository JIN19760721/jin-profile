"""
kabu ステーション WebSocket クライアント。

- 自動再接続（指数バックオフ、最大 60 秒）
- メッセージ受信時にコールバック on_message(dict) を呼ぶ
- asyncio ベース
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

import websockets

from src.config import WS_RECONNECT_DELAY

log = logging.getLogger(__name__)

OnMessage = Callable[[dict], Awaitable[None]]


class WebSocketClient:
    def __init__(self, url: str, token: str, on_message: OnMessage) -> None:
        self._url        = url
        self._token      = token
        self._on_message = on_message
        self._running    = False

    async def run(self) -> None:
        """自動再接続ループ。stop() が呼ばれるまで継続する。"""
        self._running = True
        delay = WS_RECONNECT_DELAY

        while self._running:
            try:
                log.info("WebSocket 接続中: %s", self._url)
                async with websockets.connect(
                    self._url,
                    additional_headers={"X-API-KEY": self._token},
                    ping_interval=30,
                    ping_timeout=10,
                ) as ws:
                    delay = WS_RECONNECT_DELAY  # 接続成功でリセット
                    log.info("WebSocket 接続成功")
                    async for raw in ws:
                        if not self._running:
                            break
                        try:
                            msg = json.loads(raw)
                            await self._on_message(msg)
                        except json.JSONDecodeError:
                            log.debug("JSON 解析失敗（無視）: %s", raw[:80])

            except asyncio.CancelledError:
                break
            except Exception as e:
                if not self._running:
                    break
                log.warning("WebSocket 切断: %s — %d 秒後に再接続", e, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)

        log.info("WebSocket クライアント停止")

    def stop(self) -> None:
        self._running = False
