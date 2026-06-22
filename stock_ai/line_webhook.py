"""
LINE Messaging API Webhook サーバー。

銘柄コードを含むメッセージを受信して watchlist に登録し、結果を LINE に返信する。
取引日でなければ何もせず「取引日ではありません」と返信する。取引時間内であれば、
登録した銘柄の5分足監視（main.py --intraday）をバックグラウンドで非同期に起動する
（Webhookの応答はその完了を待たない）。

このプロセス自身が、Windowsタスクスケジューラを使わずに、取引時間中5分おきに
watchlist銘柄の5分足監視を定期実行するスケジューラスレッドも兼ねる
（_run_scheduler_loop）。自動売買は行わない。

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
import subprocess
import sys
import threading
import time as time_module
from datetime import datetime
from pathlib import Path

import requests
from flask import Flask, abort, request

from config import (
    LINE_CHANNEL_ACCESS_TOKEN,
    LINE_CHANNEL_SECRET,
    LOGS_DIR,
    is_market_open_now,
    is_trading_day,
)
from watchlist import (
    parse_watch_codes,
    register_watchlist,
    validate_codes_in_latest_ranking,
)

_BASE_DIR = Path(__file__).parent

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


# ── 5分足監視のバックグラウンド起動・定期実行 ──────────────────────────────────

_monitor_lock = threading.Lock()
_current_proc: subprocess.Popen | None = None

_SCHEDULER_ACTIVE_INTERVAL_SECONDS = 300  # 取引時間中の実行間隔（5分）
_SCHEDULER_IDLE_POLL_SECONDS = 60         # 取引時間外・休日の再チェック間隔（1分）


def _trigger_intraday_monitoring(codes: list[str] | None = None) -> None:
    """
    5分足監視（main.py --intraday）をバックグラウンドで非同期に起動する。
    codes 省略時は --codes を渡さず、main.py 側の優先順位
    （--codes > watchlist > ランキング上位5件）に従う。
    Webhookハンドラの応答（LINEへの返信）はこの完了を待たない
    （LINE Webhookは数秒以内の応答を期待するため、ここで同期的に待つとタイムアウト・
    イベント再送の原因になる）。判定結果は --notify-line により別途LINEへ通知される。
    前回起動分がまだ実行中の場合は今回の起動をスキップする（重複実行防止）。
    """
    global _current_proc

    with _monitor_lock:
        if _current_proc is not None and _current_proc.poll() is None:
            logger.info("前回の5分足監視がまだ実行中のため、今回の起動をスキップします。")
            return

        log_path = LOGS_DIR / f"webhook_intraday_{datetime.now():%Y%m%d}.log"
        cmd = [
            sys.executable, str(_BASE_DIR / "main.py"), "--intraday",
            "--entry-mode", "first_close", "--notify-line",
        ]
        if codes:
            cmd += ["--codes", *codes]

        log_file = open(log_path, "a", encoding="utf-8")
        try:
            _current_proc = subprocess.Popen(cmd, cwd=str(_BASE_DIR), stdout=log_file, stderr=log_file)
            logger.info("5分足監視をバックグラウンドで起動しました: %s (log=%s)", codes or "(watchlist/ランキング)", log_path)
        finally:
            log_file.close()


def _run_scheduler_loop() -> None:
    """
    Windowsタスクスケジューラを使わず、このプロセス自身が取引時間中5分おきに
    watchlist銘柄の5分足監視を定期実行するバックグラウンドループ。
    取引時間外・休日は60秒おきに状態を再チェックするだけで監視は実行しない
    （取引開始を遅延なく検知するため、5分間隔より短いポーリングにしている）。
    """
    logger.info("5分足監視スケジューラを起動しました（取引時間中は%d秒おきに自動実行）", _SCHEDULER_ACTIVE_INTERVAL_SECONDS)
    while True:
        if is_market_open_now():
            try:
                _trigger_intraday_monitoring()
            except Exception as e:
                logger.error("定期監視の起動に失敗しました: %s", e, exc_info=True)
            time_module.sleep(_SCHEDULER_ACTIVE_INTERVAL_SECONDS)
        else:
            time_module.sleep(_SCHEDULER_IDLE_POLL_SECONDS)


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

    if not is_trading_day():
        _reply(reply_token, "本日は取引日ではありません。")
        return  # 取引日でない場合は watchlist 登録・監視起動を行わない

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

    # 取引時間内であれば5分足監視をバックグラウンドで即時起動する
    # （Webhookの応答はこの完了を待たない。取引時間外は次回の定期実行まで待つ）
    market_open = is_market_open_now()
    if market_open:
        _trigger_intraday_monitoring(valid_codes)

    # 正常返信
    lines = ["監視対象を登録しました。"]
    for code in valid_codes:
        name = company_names.get(code, "")
        lines.append(f"{code} {name}".strip())
    lines.append("")
    if market_open:
        lines.append("取引時間中のため、5分足監視をバックグラウンドで開始しました。")
    else:
        lines.append("取引時間外のため監視待機中です。取引時間（09:00〜15:30）になると自動的に監視を開始します。")

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
    if not LINE_CHANNEL_SECRET and os.getenv("ALLOW_INSECURE_WEBHOOK", "").lower() not in ("1", "true"):
        raise SystemExit(
            "LINE_CHANNEL_SECRET が未設定です。署名検証なしでWebhookを公開すると "
            "誰でも watchlist 登録APIを呼べてしまうため起動を中止します。"
            "意図的に無署名で起動する場合は環境変数 ALLOW_INSECURE_WEBHOOK=1 を設定してください。"
        )

    threading.Thread(target=_run_scheduler_loop, daemon=True).start()

    port = int(os.getenv("WEBHOOK_PORT", "5000"))
    logger.info("LINE Webhook サーバー起動 (port=%d)", port)
    app.run(host="0.0.0.0", port=port)
