"""
経路D: エントリー直前のClaude最終確認。

risk_manager・entry_policyを通過した候補1件について、実際に発注する直前に
Claudeへ最終確認する。バッチ定期再評価（旧方式）はレビューのタイミングと
エントリーのタイミングが独立しているため、確認が完了する前にトレードが
完結してしまう問題があった。この方式では条件を満たした瞬間の候補だけを
評価するため、そのズレが生じない。

PRE_SURGE_SETUP自体が「価格がまだ動いていない」局面を前提とするため、
応答待ちの数秒が実害になりにくい（発注バッファを0%にできたのと同じ理屈）。

失敗・タイムアウト時はフェイルオープン（Claude抜きで発注を続行）。
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from src.config import ANTHROPIC_API_KEY, PRE_MARKET_LLM_MODEL

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """あなたは日本株のデイトレード「経路D」戦略の最終確認を行うアシスタントです。
経路Dは「出来高が先行し、価格はまだ動いていない（PRE_SURGE_SETUP）」銘柄を
捉えて即座に買いエントリーする短期デイトレード手法です。以下の1銘柄について、
今まさに買いエントリーする価値があるか、yes/noで判断してください。

判断材料:
- score / reasons: 前日までのランキングに基づくスクリーニングスコアと根拠
- surge_score / surge_signal: リアルタイムの出来高急増率・価格加速度等から
  算出した急騰予兆スコア（PRE_SURGE_SETUP = 出来高急増中だが価格はまだ横ばい）
- volume_spike_ratio / turnover_spike_ratio: 20日平均に対する出来高・売買代金の
  急増倍率（本日累計を経過時間で投影した値）
- price_change_1m / price_change_5m: 直近1分・5分の価格変化率
- vwap_position: VWAPに対する位置（0=VWAP以下、1=VWAP以上）

判断方針:
- 出来高急増率・売買代金急増率が高いほど本物の資金流入である可能性が高い
- 直近5分の値動きが横ばい〜わずかなプラスであれば「まだ動いていない」の
  条件に合致し望ましい。既にマイナスに転じているなら反落中の可能性を疑うこと
- VWAP以下（vwap_position=0）は買い圧力が弱い兆候として慎重に評価すること
- 発注可否・株数・損切りラインなどのハードなリスク判断は別のロジックが
  行うため、ここでは「今この瞬間に買う価値があるか」のみを判断すること
- 迷う場合はエントリーを見送ってよい（無理に埋める必要はない。理由は1行で簡潔に）
"""


class _Verdict(BaseModel):
    enter: bool
    reason: str


def should_enter(candidate: dict) -> tuple[bool, str]:
    """経路Dのエントリー候補1件についてClaudeに最終確認する。

    戻り値: (enter, reason)。失敗時はフェイルオープンで (True, ...) を返す。
    """
    if not ANTHROPIC_API_KEY:
        return True, "ANTHROPIC_API_KEY未設定のためフェイルオープン"

    try:
        import anthropic
    except ImportError:
        return True, "anthropicパッケージ未インストールのためフェイルオープン"

    summary = {
        "symbol":                candidate.get("symbol"),
        "symbol_name":           candidate.get("symbol_name"),
        "score":                 candidate.get("score"),
        "reasons":               candidate.get("reasons"),
        "surge_score":           candidate.get("surge_score"),
        "surge_signal":          candidate.get("surge_signal"),
        "volume_spike_ratio":    candidate.get("volume_spike_ratio"),
        "turnover_spike_ratio":  candidate.get("turnover_spike_ratio"),
        "price_change_1m":       candidate.get("price_change_1m"),
        "price_change_5m":       candidate.get("price_change_5m"),
        "vwap_position":         candidate.get("vwap_position"),
        "current_price":         candidate.get("current_price"),
    }
    user_content = (
        "以下の銘柄に今まさに買いエントリーする価値があるか判断してください。\n\n"
        + json.dumps(summary, ensure_ascii=False, indent=2)
    )

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    try:
        response = client.messages.parse(
            model=PRE_MARKET_LLM_MODEL,
            max_tokens=1024,
            thinking={"type": "adaptive"},
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_format=_Verdict,
        )
    except Exception as e:
        log.warning("エントリー直前Claude確認 呼び出し失敗 %s: %s", candidate.get("symbol"), e)
        return True, f"Claude呼び出し失敗のためフェイルオープン: {e}"

    if response.parsed_output is None:
        return True, "構造化出力の解析に失敗したためフェイルオープン"

    verdict = response.parsed_output
    return verdict.enter, verdict.reason
