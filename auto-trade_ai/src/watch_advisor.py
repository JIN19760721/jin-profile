"""
ウォッチリスト銘柄の買い時・売り時アドバイス（--advise）。

kabuステーションAPIには一切依存しない。yfinanceの当日分足・日足から
技術的なスナップショット（現在値・当日高安・VWAP概算・RCI・移動平均）を作り、
TDnetの適時開示（tdnet_fetcher.py流用）と合わせてClaudeに渡し、
未保有銘柄は「買い時」、保有銘柄は取得単価・含み損益を踏まえた「売り時」を
助言させる。発注は一切行わない（あくまで助言のみ、実行はユーザー判断）。

失敗時（データ取得・API呼び出し）はフェイルオープンでその銘柄／全体をスキップする。
"""

from __future__ import annotations

import json
import logging

import yfinance as yf
from pydantic import BaseModel

from src import db, entry_policy, notifier, tdnet_fetcher
from src.config import ANTHROPIC_API_KEY, RCI_PERIOD, WATCH_ADVISOR_MODEL

log = logging.getLogger(__name__)


class _Advice(BaseModel):
    symbol: str
    action: str
    reason: str
    watch_level: str | None = None


class _Advices(BaseModel):
    advices: list[_Advice]


_SYSTEM_PROMPT = """あなたは日本株の個人投資家向けに、注目銘柄の「買い時」「売り時」を助言するアシスタントです。
このシステムは自動発注を一切行いません。実際の売買はユーザー自身が判断して行います。

対象銘柄には2種類あります:
- 未保有銘柄（held=false）: 「買い時」を判断する。action は BUY_NOW（今が買い時）/
  WAIT（様子見、まだ買い時ではない）/ SKIP（今回は見送り推奨）のいずれか
- 保有銘柄（held=true）: 「売り時」を判断する。entry_price（取得単価）・qty（株数）・
  現在の含み損益も踏まえて判断する。action は SELL_NOW（利確/損切りタイミング）/
  HOLD（保有継続）/ CUT_LOSS（損切り推奨）のいずれか

各銘柄について渡されるデータ:
- market_status: "live"（本日の分足データあり＝取引時間中または取引時間終了後）または
  "closed_or_pre_market"（分足データなし＝寄り付き前など。前日終値ベースの参考情報のみ）
- current_price: 直近価格
- prev_close: 前日終値
- day_open / day_high / day_low: 本日の始値・高値・安値（market_status="live"の場合のみ）
- vwap: 本日のVWAP概算（分足の代表値×出来高から算出、market_status="live"の場合のみ）
- rci: 1分足RCI(9)。+80以上で過熱（買われすぎ）、-80以下で売られすぎの目安
- ma5_daily / ma20_daily: 日足5日・20日移動平均（トレンド判定用）
- disclosures: TDnetの当日・前営業日引け後の適時開示タイトル（あれば）
- held / entry_price / qty: 保有状況（heldがtrueの場合のみentry_price/qtyが入る。
  entry_priceがnullの場合は取得単価未登録のため含み損益は判断できない）
- memo: ユーザーが登録時につけたメモ（任意）

判断方針:
- market_status="closed_or_pre_market"の銘柄は、取引時間外でリアルタイム判断ができない旨を
  理由に含め、ユーザーが実際の株価を確認したうえで判断する前提で助言すること
- 保有銘柄は含み損益率 (current_price - entry_price) / entry_price を必ず言及し、
  利益が乗っている場合は利確ラインの目安、含み損の場合は損切りラインの目安を意識して判断すること
- disclosuresに悪材料（下方修正・特別損失等）があれば保有銘柄は CUT_LOSS/SELL_NOW を積極的に
  検討し、未保有銘柄は BUY_NOW を避けること
- RCIが+80以上で過熱している未保有銘柄はBUY_NOWを避け、WAITとして「押し目待ち」を理由に含めること
- watch_level には、判断が変わる具体的な価格の目安があれば1行で含める
  （例: "1850円を上抜けたら買い時" "取得単価5800円を割り込んだら損切り検討"）。
  適切な目安がなければ null でよい
- 理由は1銘柄につき2行程度で簡潔にまとめること
"""


def _yf_symbol(symbol: str) -> str:
    return f"{symbol}.T"


def _fetch_technical_snapshot(symbol: str) -> dict | None:
    """当日分足＋日足から技術的スナップショットを作る。取得失敗時は None。"""
    try:
        intraday = yf.download(
            _yf_symbol(symbol), interval="1m", period="1d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
    except Exception as e:
        log.warning("%s: 分足取得失敗: %s", symbol, e)
        intraday = None

    try:
        daily = yf.download(
            _yf_symbol(symbol), interval="1d", period="30d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
    except Exception as e:
        log.warning("%s: 日足取得失敗: %s", symbol, e)
        daily = None

    if daily is None or daily.empty:
        log.warning("%s: 日足データが取得できないためスキップします", symbol)
        return None

    prev_close = float(daily["Close"].iloc[-1])
    ma5_daily  = float(daily["Close"].rolling(5).mean().iloc[-1]) if len(daily) >= 5 else None
    ma20_daily = float(daily["Close"].rolling(20).mean().iloc[-1]) if len(daily) >= 20 else None

    if intraday is None or intraday.empty:
        # 寄り付き前・取引時間外で当日分足がまだ無い場合は前日終値ベースの参考情報のみ返す
        return {
            "market_status": "closed_or_pre_market",
            "current_price": round(prev_close, 1),
            "prev_close":    round(prev_close, 1),
            "ma5_daily":     round(ma5_daily, 1) if ma5_daily is not None else None,
            "ma20_daily":    round(ma20_daily, 1) if ma20_daily is not None else None,
        }

    closes  = intraday["Close"].dropna().tolist()
    current_price = float(closes[-1]) if closes else prev_close
    day_open = float(intraday["Open"].iloc[0])
    day_high = float(intraday["High"].max())
    day_low  = float(intraday["Low"].min())

    typical = (intraday["High"] + intraday["Low"] + intraday["Close"]) / 3
    vol_sum = float(intraday["Volume"].sum())
    vwap = float((typical * intraday["Volume"]).sum() / vol_sum) if vol_sum > 0 else None

    rci = entry_policy._calc_rci(closes, RCI_PERIOD) if len(closes) >= RCI_PERIOD else None

    return {
        "market_status": "live",
        "current_price": round(current_price, 1),
        "prev_close":    round(prev_close, 1),
        "day_open":      round(day_open, 1),
        "day_high":      round(day_high, 1),
        "day_low":       round(day_low, 1),
        "vwap":          round(vwap, 1) if vwap is not None else None,
        "rci":           rci,
        "ma5_daily":     round(ma5_daily, 1) if ma5_daily is not None else None,
        "ma20_daily":    round(ma20_daily, 1) if ma20_daily is not None else None,
    }


def _fetch_disclosures_for_symbols(symbols: list[str]) -> dict[str, list[dict]]:
    try:
        all_disclosures = tdnet_fetcher.fetch_recent_disclosures()
    except Exception as e:
        log.warning("TDnet開示取得に失敗しました（開示情報なしで継続）: %s", e)
        return {}
    return {s: all_disclosures[s] for s in symbols if s in all_disclosures}


def _call_claude(summaries: list[dict], model: str) -> list[dict] | None:
    """Claudeに全銘柄をまとめて渡し、買い時・売り時の助言を得る。失敗時は None。"""
    if not ANTHROPIC_API_KEY:
        log.warning("ANTHROPIC_API_KEY が未設定のためウォッチリストアドバイスをスキップします")
        return None

    try:
        import anthropic
    except ImportError:
        log.warning("anthropic パッケージが未インストールのためスキップします")
        return None

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    user_content = (
        f"以下は現在ウォッチ中の{len(summaries)}銘柄の技術指標・開示情報です。"
        f"各銘柄について買い時/売り時の判断と理由を1件ずつ返してください。\n\n"
        + json.dumps(summaries, ensure_ascii=False, indent=2)
    )

    try:
        response = client.messages.parse(
            model=model,
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_format=_Advices,
        )
    except Exception as e:
        log.error("Claude API 呼び出し失敗: %s", e)
        return None

    if response.parsed_output is None:
        log.warning("Claude API: 構造化出力の解析に失敗しました")
        return None

    return [
        {"symbol": a.symbol, "action": a.action, "reason": a.reason, "watch_level": a.watch_level}
        for a in response.parsed_output.advices
    ]


def run(model: str = WATCH_ADVISOR_MODEL) -> list[dict]:
    """ウォッチリスト全銘柄の買い時・売り時アドバイスを実行し、通知する。

    戻り値: [{"symbol":..., "action":..., "reason":..., "watch_level":...}, ...]
    （該当なし・失敗時は空リスト）
    """
    watchlist = db.get_watchlist()
    if not watchlist:
        log.warning("ウォッチリストが空です。--watch-add で銘柄を登録してください。")
        return []

    symbols = [w["symbol"] for w in watchlist]
    disclosures_by_symbol = _fetch_disclosures_for_symbols(symbols)

    summaries: list[dict] = []
    for w in watchlist:
        symbol = w["symbol"]
        snap = _fetch_technical_snapshot(symbol)
        if snap is None:
            continue
        summary = {"symbol": symbol, "held": bool(w["held"]), **snap}
        if w["held"]:
            summary["entry_price"] = w["entry_price"]
            summary["qty"] = w["qty"]
        if w.get("memo"):
            summary["memo"] = w["memo"]
        items = disclosures_by_symbol.get(symbol)
        if items:
            summary["disclosures"] = [f'{it["time"]} {it["title"]}' for it in items[:3]]
        summaries.append(summary)

    if not summaries:
        log.warning("ウォッチリスト銘柄の技術指標を取得できませんでした。")
        return []

    advices = _call_claude(summaries, model)
    if advices is None:
        log.warning("ウォッチリストアドバイス: Claude呼び出しに失敗しました。")
        return []

    for a in advices:
        level = f" (目安: {a['watch_level']})" if a.get("watch_level") else ""
        log.info("[%s] %s: %s%s", a["action"], a["symbol"], a["reason"], level)

    try:
        notifier.notify_watch_advice(advices)
    except Exception as e:
        log.warning("ウォッチリストアドバイスの通知に失敗: %s", e)

    return advices
