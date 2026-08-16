import logging
import time

import requests

from src.config import API_PASSWORD, BASE_URL, KABU_ENV

log = logging.getLogger(__name__)

_RATE_LIMIT_RETRIES = 3
_RATE_LIMIT_WAIT_SEC = 1.5


class KabuClient:
    """kabuステーション REST API クライアント。"""

    def __init__(self) -> None:
        self._token: str | None = None
        self._session = requests.Session()

    def authenticate(self) -> None:
        """POST /token でAPIトークンを取得する。"""
        if not API_PASSWORD:
            raise ValueError(
                "API_PASSWORD が未設定です。.env に API_PASSWORD を設定してください。"
            )

        env_label = "本番" if KABU_ENV == "prod" else "検証"
        log.info("kabu STATION接続先: %s (%s環境, KABU_ENV=%s)", BASE_URL, env_label, KABU_ENV)

        url = f"{BASE_URL}/token"
        try:
            resp = self._session.post(
                url, json={"APIPassword": API_PASSWORD}, timeout=10
            )
            resp.raise_for_status()
        except requests.ConnectionError:
            raise ConnectionError(
                f"kabuステーションに接続できませんでした ({BASE_URL})。"
                "kabuステーションが起動中かつAPI利用設定がONであることを確認してください。"
            )
        except requests.HTTPError as e:
            raise RuntimeError(f"認証に失敗しました (HTTP {e.response.status_code}): {e}")

        token = resp.json().get("Token")
        if not token:
            raise RuntimeError(
                "トークンが取得できませんでした。APIパスワードを確認してください。"
            )
        self._token = token
        log.info("認証成功")

    # ── 内部ヘルパー ──────────────────────────────────────────────────────────

    def _headers(self) -> dict:
        return {"X-API-KEY": self._token, "Content-Type": "application/json"}

    def _handle_response(self, resp: requests.Response, url: str) -> dict | list:
        """ステータス確認・JSON 返却。401/429 は呼び出し元で処理するため別例外を立てる。"""
        if resp.status_code == 401:
            raise _TokenExpiredError()
        if resp.status_code == 429:
            raise _RateLimitError()
        try:
            resp.raise_for_status()
        except requests.HTTPError as e:
            body_text = ""
            try:
                body_text = e.response.text
            except Exception:
                pass
            raise RuntimeError(
                f"リクエスト失敗 (HTTP {e.response.status_code}): {url} — {body_text}"
            )
        return resp.json()

    def _reauth_and_retry(self, fn):
        """401 時に再認証して fn() を 1 回だけ再試行する。"""
        log.warning("トークン期限切れ（401）。再認証します。")
        self.authenticate()
        return fn()

    # ── 公開メソッド ──────────────────────────────────────────────────────────

    def get(self, path: str, params: dict | None = None) -> dict | list:
        """認証済み GET リクエスト。401 時は自動再認証、429 時は最大 N 回リトライ。"""
        if not self._token:
            raise RuntimeError("未認証です。先に authenticate() を呼んでください。")

        url = f"{BASE_URL}{path}"

        def _do():
            try:
                resp = self._session.get(
                    url, headers=self._headers(), params=params, timeout=15
                )
            except requests.ConnectionError:
                raise ConnectionError(f"リクエスト失敗: {url} に接続できませんでした。")
            return self._handle_response(resp, url)

        for attempt in range(1, _RATE_LIMIT_RETRIES + 1):
            try:
                return _do()
            except _TokenExpiredError:
                return self._reauth_and_retry(_do)
            except _RateLimitError:
                if attempt >= _RATE_LIMIT_RETRIES:
                    raise RuntimeError(
                        f"API実行回数制限 (429): {_RATE_LIMIT_RETRIES}回リトライしても解消しませんでした。{url}"
                    )
                log.warning(
                    "API実行回数制限 (429) — %.1f秒後にリトライします (%d/%d): %s",
                    _RATE_LIMIT_WAIT_SEC, attempt, _RATE_LIMIT_RETRIES, url,
                )
                time.sleep(_RATE_LIMIT_WAIT_SEC)

    def post(self, path: str, body: dict) -> dict:
        """認証済み POST リクエスト。401 時は自動再認証して 1 回リトライ。"""
        if not self._token:
            raise RuntimeError("未認証です。先に authenticate() を呼んでください。")

        url = f"{BASE_URL}{path}"

        def _do():
            try:
                resp = self._session.post(
                    url, headers=self._headers(), json=body, timeout=15
                )
            except requests.ConnectionError:
                raise ConnectionError(f"リクエスト失敗: {url} に接続できませんでした。")
            return self._handle_response(resp, url)

        try:
            return _do()
        except _TokenExpiredError:
            return self._reauth_and_retry(_do)

    def put(self, path: str, body: dict) -> dict:
        """認証済み PUT リクエスト。401 時は自動再認証して 1 回リトライ。"""
        if not self._token:
            raise RuntimeError("未認証です。先に authenticate() を呼んでください。")

        url = f"{BASE_URL}{path}"

        def _do():
            try:
                resp = self._session.put(
                    url, headers=self._headers(), json=body, timeout=15
                )
            except requests.ConnectionError:
                raise ConnectionError(f"リクエスト失敗: {url} に接続できませんでした。")
            return self._handle_response(resp, url)

        try:
            return _do()
        except _TokenExpiredError:
            return self._reauth_and_retry(_do)


class _TokenExpiredError(Exception):
    """401 Unauthorized を示す内部例外。KabuClient 外には露出しない。"""


class _RateLimitError(Exception):
    """429 Too Many Requests を示す内部例外。KabuClient 外には露出しない。"""
