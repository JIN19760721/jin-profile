"""
LINE Messaging API Webhook サーバー。

銘柄コードを含むメッセージを受信して watchlist に登録し、結果を LINE に返信する。
自動売買は行わない。watchlist 登録のみ。

起動方法:
    python line_webhook.py

ngrok 経由で公開する場合:
    ngrok http 5000
    → LINE Developers の Webhook URL に https://xxxxx.ngrok-free.app/callback を設定
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re

import requests
from flask import Flask, abort, request

from config import LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
from watchlist import (
    get_active_watchlist,
    parse_watch_codes,
    register_watchlist,
    validate_codes_in_latest_ranking,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply"
_MAX_CODES = 5
_CODES_ONLY_RE = re.compile(r"^[\d\s,、，　]+$")


# ── 署名検証 ──────────────────────────────────────────────────────────────────


def _verify_signature(body: bytes, signature: str) -> bool:
    """
    X-Line-Signature の HMAC-SHA256 検証。
    LINE_CHANNEL_SECRET 未設定時は検証をスキップしてログ警告を出す。
    本番利用時は必ず LINE_CHANNEL_SECRET を設定すること。
    """
    if not LINE_CHANNEL_SECRET:
        logger.warning("LINE_CHANNEL_SECRET 未設定: 署名検証をスキップします（本番では必ず設定してください）")
        return True
    digest = hmac.new(LINE_CHANNEL_SECRET.encode("utf-8"), body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, signature)


# ── 返信 ─────────────────────────────────────────────────────────────────────


def _reply(reply_token: str, text: str) -> None:
    """replyToken を使って LINE にテキストを返信する"""
    if not LINE_CHANNEL_ACCESS_TOKEN:
        logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未設定: 返信をスキップします")
        return
    try:
        res = requests.post(
            LINE_REPLY_URL,
            headers={
                "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "replyToken": reply_token,
                "messages": [{"type": "text", "text": text}],
            },
            timeout=10,
        )
        if res.status_code != 200:
            logger.error("LINE返信失敗: status=%s body=%s", res.status_code, res.text)
    except Exception as e:
        logger.error("LINE返信エラー: %s", e)


# ── メッセージ判定・処理 ───────────────────────────────────────────────────────


def _is_watch_command(text: str) -> bool:
    """
    テキストが銘柄監視登録コマンドかどうかを判定する。

    対応形式:
        監視 7203 3778
        watch 7203 3778
        7203 3778
        7203,3778
    """
    t = text.strip()
    lower = t.lower()
    if lower.startswith("監視") or lower.startswith("watch"):
        return True
    # プレフィックスなし: 数字・スペース・カンマのみで 4桁コードを含む場合
    return bool(_CODES_ONLY_RE.match(t) and re.search(r"\d{4}", t))


def _handle_text_message(text: str, reply_token: str) -> None:
    """テキストメッセージを処理して watchlist 登録・返信を行う"""
    if not _is_watch_command(text):
        return  # 監視コマンド以外は無視

    codes = parse_watch_codes(text)

    if not codes:
        return  # 4桁コードが抽出できなければ無視

    if len(codes) > _MAX_CODES:
        _reply(reply_token, f"監視対象は最大{_MAX_CODES}銘柄までです。")
        return

    # ランキング検証
    result = validate_codes_in_latest_ranking(codes)
    valid_codes = result["valid"]
    invalid_codes = result["invalid"]
    company_names = result["company_names"]

    if not valid_codes:
        lines = ["以下は本日の注目銘柄ランキング外のため登録しませんでした。"]
        lines.extend(invalid_codes)
        _reply(reply_token, "\n".join(lines))
        return

    # watchlist に登録
    register_watchlist(valid_codes, source="LINE")

    # 正常返信
    lines = ["監視対象を登録しました。"]
    for code in valid_codes:
        name = company_names.get(code, "")
        lines.append(f"{code} {name}".strip())
    lines.append("")
    lines.append("次回の5分足監視から対象になります。")

    if invalid_codes:
        lines.append("")
        lines.append("以下は本日の注目銘柄ランキング外のため登録しませんでした。")
        lines.extend(invalid_codes)

    _reply(reply_token, "\n".join(lines))


# ── Webhook エンドポイント ────────────────────────────────────────────────────


@app.route("/callback", methods=["POST"])
def callback():
    body = request.get_data()
    signature = request.headers.get("X-Line-Signature", "")

    if not _verify_signature(body, signature):
        logger.warning("署名検証失敗: 不正なリクエストを拒否しました")
        abort(400)

    try:
        payload = json.loads(body)
    except Exception:
        abort(400)

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        message = event.get("message", {})
        if message.get("type") != "text":
            continue
        text = message.get("text", "").strip()
        reply_token = event.get("replyToken", "")
        if text and reply_token:
            try:
                _handle_text_message(text, reply_token)
            except Exception as e:
                logger.error("メッセージ処理エラー: %s", e, exc_info=True)

    return "OK", 200


# ── 起動 ─────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    port = int(os.getenv("WEBHOOK_PORT", "5000"))
    logger.info("LINE Webhook サーバー起動 (port=%d)", port)
    app.run(host="0.0.0.0", port=port)
