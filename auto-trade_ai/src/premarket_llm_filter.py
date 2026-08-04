"""
Claude 寄り付き前フィルタ。

通常モード（client を渡した場合）:
  08:30頃、kabuランキングAPIがまだ使えない時間帯に、既存の候補銘柄
  （daily_candidates、08:00のyfinance事前スキャン等で作成済み）に対して
  /board の気配値（最良気配・板全体の買い/売り数量）を取得し、Claudeに
  「本日注目すべき銘柄」を絞り込ませる。

手動モード（client=None）:
  kabuステーションAPIが（発注権限だけでなく気配取得も含めて）一切使えない
  状況向け。/board を一切呼ばず、前日までのyfinanceスクリーニングスコア
  （score/reasons）のみをもとにClaudeに絞り込ませる。main.py の
  --llm-filter から手動実行され、結果を見てユーザーが自分で発注する。

発注可否・株数・損切りラインなどのハードなリスク判断は一切行わない。
ここでの役割はあくまで「一次選定」であり、失敗時は何もせず
（フェイルオープン）既存の候補リストがそのまま使われる。
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from src import db, notifier
from src.config import (
    ANTHROPIC_API_KEY,
    PRE_MARKET_LLM_MODEL,
    PRE_MARKET_LLM_TOP_N,
    PRE_MARKET_LLM_UNIVERSE_SIZE,
)
from src.kabu_client import KabuClient

log = logging.getLogger(__name__)

_EXCHANGE_CODE = 1


class _Pick(BaseModel):
    symbol: str
    reason: str


class _Picks(BaseModel):
    picks: list[_Pick]


_SYSTEM_PROMPT_BOARD = """あなたは日本株のデイトレード候補選定を補助するアシスタントです。
このシステムは「買いエントリーのみ」を行います（空売りは行いません）。
寄り付き前（8:30頃）の kabu ステーション気配値データをもとに、本日「買い」で
狙う価値がある銘柄を絞り込んでください。下落が予想される銘柄は、値動きとして
興味深く見えても選ばないこと（買いエントリー戦略では活用できないため）。

各銘柄について渡されるデータ:
- score / reasons: 前日までの値上がり率・出来高等ランキングに基づくスクリーニングスコアと根拠
- expected_change_pct: 気配値（最良気配の出来高加重中値）から算出した前日終値比の予想騰落率
- buy_dominance: under_buy_qty / (under_buy_qty + over_sell_qty) (%)。50%超で買い優勢
- imbalance: (under_buy_qty - over_sell_qty) / 合計。-1〜+1、正で買い優勢
- spread_pct: 気配スプレッド(%)。大きいほど流動性が薄く値が飛びやすい。
  負の値は買い気配が売り気配を上回る「クロス」状態を意味し、寄り付き前の
  強い需給の偏り（上に飛びやすい）を示すシグナルとして扱うこと
- under_buy_qty: 買い超過数量（板全体で約定できずに余っている買い注文の量）
- over_sell_qty: 売り超過数量（同、売り注文側）
- market_order_buy_qty / market_order_sell_qty: 成行注文数量（大きいほど確度の高い売買意欲）

選定方針:
- expected_change_pct が負（下落予想）の銘柄は、値動きとして注目に値しても選ばないこと
- under_buy_qty/over_sell_qty が極端に薄いのに expected_change_pct だけ大きい銘柄は
  「見せ気配」の可能性を疑い、慎重に評価すること
- 買い優勢（imbalanceが正、buy_dominanceが高い）かつ数量も伴っている銘柄を優先すること
- 選定する銘柄が top_n に満たない場合、無理に埋めずに該当なしのままでよい
- 実際の発注可否・株数・損切りラインなどは別のロジックが判断するため、ここでは
  「買いで狙う価値がある銘柄の絞り込みと理由」のみを行うこと（1銘柄につき理由は1行程度で簡潔に）
"""

_SYSTEM_PROMPT_NO_BOARD = """あなたは日本株のデイトレード候補選定を補助するアシスタントです。
このシステムは「買いエントリーのみ」を行います（空売りは行いません）。

重要な制約: kabuステーションAPIが（発注権限だけでなく気配値取得も含めて）
一切利用できない状況のため、寄り付き前のリアルタイム気配値・板情報は全く
渡されません。渡されるのは前日終値時点までのデータのみです。ユーザーは
この選定結果を参考情報として、寄り付き後の実際の株価・気配を自分の目で
確認したうえで手動で発注します（自動発注は行いません）。

各銘柄について渡されるデータ:
- score: 前日までの値上がり率・出来高急増・売買代金急増ランキングに基づく
  総合スクリーニングスコア
- reasons: スコアの根拠（各ランキングでの順位。複数のランキングにランクイン
  しているほど根拠が強い）
- current_price: 前日終値（円）

選定方針:
- 複数のランキングに同時にランクインしている銘柄（reasonsに理由が複数ある銘柄）を優先すること
- 値上がり率のみでなく出来高・売買代金の急増を伴っている銘柄を優先すること
- リアルタイムデータがない前提を踏まえ、寄り付き後の値動きが前日までの
  トレンドと逆転するリスクがある点を理由に軽く触れてよい
- 選定する銘柄が top_n に満たない場合、無理に埋めずに該当なしのままでよい
- 実際の発注可否・株数・損切りラインなどはユーザー自身が判断するため、ここでは
  「買いで狙う価値がある銘柄の絞り込みと理由」のみを行うこと（1銘柄につき理由は1行程度で簡潔に）
"""


def _fetch_indicative(client: KabuClient, symbol: str) -> dict | None:
    """/board から気配値関連の指標を取得・算出する。取得できなければ None。"""
    try:
        board = client.get(f"/board/{symbol}@{_EXCHANGE_CODE}")
    except Exception as e:
        log.warning("気配値取得失敗 %s: %s", symbol, e)
        return None
    if not board:
        return None

    prev_close = float(board.get("PreviousClose") or 0)
    bid_price1 = float(board.get("BidPrice1") or board.get("BidPrice") or 0)
    ask_price1 = float(board.get("AskPrice1") or board.get("AskPrice") or 0)
    bid_qty1   = float(board.get("BidQty1") or board.get("BidQty") or 0)
    ask_qty1   = float(board.get("AskQty1") or board.get("AskQty") or 0)
    # kabu API の実フィールドは TotalBidQty/TotalAskQty ではなく
    # UnderBuyQty（買い超過数量）/ OverSellQty（売り超過数量）。
    # 板全体の需給インバランスはこちらが本体で、TotalBidQty/TotalAskQty は
    # 環境差異に備えたフォールバックとして残す。
    total_bid  = float(board.get("UnderBuyQty") or board.get("TotalBidQty") or 0)
    total_ask  = float(board.get("OverSellQty") or board.get("TotalAskQty") or 0)
    market_buy  = float(board.get("MarketOrderBuyQty") or 0)
    market_sell = float(board.get("MarketOrderSellQty") or 0)

    total_qty = total_bid + total_ask
    buy_dominance = (total_bid / total_qty * 100) if total_qty > 0 else None
    imbalance = ((total_bid - total_ask) / total_qty) if total_qty > 0 else None

    denom = bid_qty1 + ask_qty1
    if denom > 0 and bid_price1 > 0 and ask_price1 > 0:
        expected_price = (bid_price1 * ask_qty1 + ask_price1 * bid_qty1) / denom
    elif bid_price1 > 0 and ask_price1 > 0:
        expected_price = (bid_price1 + ask_price1) / 2
    else:
        expected_price = None

    expected_change_pct = None
    if expected_price is not None and prev_close > 0:
        expected_change_pct = (expected_price - prev_close) / prev_close * 100

    spread_pct = None
    if bid_price1 > 0 and ask_price1 > 0:
        spread_pct = (ask_price1 - bid_price1) / ask_price1 * 100

    return {
        "prev_close":          prev_close or None,
        "expected_price":      round(expected_price, 1) if expected_price is not None else None,
        "expected_change_pct": round(expected_change_pct, 2) if expected_change_pct is not None else None,
        "buy_dominance":       round(buy_dominance, 1) if buy_dominance is not None else None,
        "imbalance":           round(imbalance, 3) if imbalance is not None else None,
        "spread_pct":          round(spread_pct, 2) if spread_pct is not None else None,
        "under_buy_qty":       total_bid or None,
        "over_sell_qty":       total_ask or None,
        "market_order_buy_qty":  market_buy or None,
        "market_order_sell_qty": market_sell or None,
    }


def _call_claude(
    summaries: list[dict], top_n: int, model: str, system_prompt: str = _SYSTEM_PROMPT_BOARD
) -> list[dict] | None:
    """Claude に候補一覧を渡して上位 top_n 件を選ばせる。失敗時は None（フェイルオープン）。"""
    if not ANTHROPIC_API_KEY:
        log.warning("ANTHROPIC_API_KEY が未設定のため Claude 寄り付き前フィルタをスキップします")
        return None

    try:
        import anthropic
    except ImportError:
        log.warning("anthropic パッケージが未インストールのため Claude 寄り付き前フィルタをスキップします")
        return None

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    user_content = (
        f"以下は本日の候補銘柄（{len(summaries)}件）の気配値データです。"
        f"最も注目すべき上位{top_n}件以内を選び、各銘柄1行で理由を付けてください。\n\n"
        + json.dumps(summaries, ensure_ascii=False, indent=2)
    )

    try:
        response = client.messages.parse(
            model=model,
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
            output_format=_Picks,
        )
    except Exception as e:
        log.error("Claude API 呼び出し失敗: %s", e)
        return None

    if response.parsed_output is None:
        log.warning("Claude API: 構造化出力の解析に失敗しました")
        return None

    picks = response.parsed_output.picks[:top_n]
    return [{"symbol": p.symbol, "reason": p.reason} for p in picks]


def run(client: KabuClient | None) -> dict[str, str]:
    """寄り付き前フィルタを実行し、結果を daily_candidates に保存・通知する。

    client が None の場合は /board を一切呼ばず、daily_candidates の
    score/reasons のみをもとに選定する（kabu API が全般的に使えない
    手動モード向け）。

    戻り値: {symbol: reason} の選定結果（該当なし・失敗時は {}）。
    """
    candidates = db.get_daily_candidates()
    if not candidates:
        log.warning("Claude寄り付き前フィルタ: 候補銘柄がありません。スキップします。")
        return {}

    pool = candidates[:PRE_MARKET_LLM_UNIVERSE_SIZE]

    summaries: list[dict] = []
    evaluated_symbols: list[str] = []

    if client is not None:
        for c in pool:
            symbol = c.get("symbol")
            if not symbol:
                continue
            indicative = _fetch_indicative(client, symbol)
            if indicative is None:
                continue
            evaluated_symbols.append(symbol)
            summaries.append({
                "symbol":      symbol,
                "symbol_name": c.get("symbol_name") or "",
                "score":       c.get("score"),
                "reasons":     c.get("reasons"),
                **indicative,
            })
        system_prompt = _SYSTEM_PROMPT_BOARD
        empty_warning = "気配値を取得できた銘柄がありませんでした。"
    else:
        for c in pool:
            symbol = c.get("symbol")
            if not symbol:
                continue
            evaluated_symbols.append(symbol)
            summaries.append({
                "symbol":        symbol,
                "symbol_name":   c.get("symbol_name") or "",
                "score":         c.get("score"),
                "reasons":       c.get("reasons"),
                "current_price": c.get("current_price"),
            })
        system_prompt = _SYSTEM_PROMPT_NO_BOARD
        empty_warning = "候補銘柄のスコアデータがありませんでした。"

    if not summaries:
        log.warning("Claude寄り付き前フィルタ: %s スキップします。", empty_warning)
        return {}

    picks = _call_claude(summaries, PRE_MARKET_LLM_TOP_N, PRE_MARKET_LLM_MODEL, system_prompt)
    if picks is None:
        log.warning("Claude寄り付き前フィルタ: Claude呼び出しに失敗したため、フィルタなしで継続します。")
        return {}

    selected = {p["symbol"]: p["reason"] for p in picks}
    db.save_llm_prefilter(evaluated_symbols, selected)

    log.info(
        "Claude寄り付き前フィルタ完了: %d件中%d件を選定",
        len(evaluated_symbols), len(selected),
    )
    for sym, reason in selected.items():
        log.info("  [選定] %s: %s", sym, reason)

    try:
        notifier.notify_llm_premarket_picks(selected)
    except Exception as e:
        log.warning("Claude選定結果の通知に失敗: %s", e)

    return selected
