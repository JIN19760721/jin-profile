"""
ポジションが利確ライン(+tp_pct%)に達したとき、Claude に保有継続か利確かを判断させる。

戻り値:
  "TAKE_PROFIT" → 即利確
  "HOLD"        → peak からのトレーリングストップに移行
API失敗時は TAKE_PROFIT を返す（フェイルセーフ）。
"""

import logging

from src.config import ANTHROPIC_API_KEY, CLAUDE_TP_MODEL, FORCE_CLOSE_TIME

log = logging.getLogger(__name__)


def advise(
    symbol: str,
    name: str,
    entry_price: float,
    current_price: float,
    pnl_pct: float,
    peak_pnl_pct: float,
    held_minutes: float,
    surge_data: dict,
) -> tuple[str, str]:
    """Claude に利確/保有継続を判断させる。(action, reason) を返す。"""
    if not ANTHROPIC_API_KEY:
        return "TAKE_PROFIT", "ANTHROPIC_API_KEY未設定 → 安全側で利確"

    surge_signal       = surge_data.get("surge_signal") or "不明"
    volume_spike       = surge_data.get("volume_spike_ratio") or 0.0
    turnover_spike     = surge_data.get("turnover_spike_ratio") or 0.0
    price_change_1m    = surge_data.get("price_change_1m") or 0.0
    price_change_5m    = surge_data.get("price_change_5m") or 0.0
    vwap_position      = surge_data.get("vwap_position") or 0.0
    near_day_high      = surge_data.get("near_day_high_ratio") or 0.0

    prompt = f"""デイトレードのポジション管理判断をしてください。

【ポジション】
銘柄: {symbol} {name}
エントリー: {entry_price:.0f}円 → 現在: {current_price:.0f}円
含み益: +{pnl_pct:.1f}%（ピーク: +{peak_pnl_pct:.1f}%）
保有時間: {held_minutes:.0f}分 / 強制クローズ: {FORCE_CLOSE_TIME}

【現在の相場状況】
surgeシグナル: {surge_signal}
出来高急増: {volume_spike:.1f}倍 / 売買代金急増: {turnover_spike:.1f}倍
価格変化（1分）: {price_change_1m:+.2f}% / （5分）: {price_change_5m:+.2f}%
VWAP位置: {vwap_position:+.2f}% / 高値比: {near_day_high:.3f}

判断基準:
- モメンタム継続（出来高・売買代金の継続、価格加速）→ HOLD
- モメンタム減衰（出来高低下、価格横ばい〜下落）→ TAKE_PROFIT
- 高値圏（near_day_high >= 0.99）→ TAKE_PROFIT 優先
- 強制クローズまで残り15分以内 → TAKE_PROFIT 優先

最初の行に「TAKE_PROFIT」または「HOLD」とのみ記載し、次の行に理由を40文字以内で記載してください。"""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=CLAUDE_TP_MODEL,
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        lines = text.split("\n", 1)
        action = lines[0].strip().upper()
        reason = lines[1].strip() if len(lines) > 1 else ""
        if action not in ("TAKE_PROFIT", "HOLD"):
            log.warning("[ClaudeTP] %s: 予期しない応答 '%s' → TAKE_PROFIT", symbol, action)
            return "TAKE_PROFIT", f"予期しない応答 → 安全側で利確"
        log.info("[ClaudeTP] %s → %s: %s", symbol, action, reason)
        return action, reason
    except Exception as e:
        log.warning("[ClaudeTP] %s: API失敗 → TAKE_PROFIT: %s", symbol, e)
        return "TAKE_PROFIT", f"API失敗 → 安全側で利確"
