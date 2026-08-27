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

両モード共通（適時開示の加味）:
  TDnet（適時開示情報閲覧サービス）の当日分＋前営業日引け後分の開示一覧を
  取得し、候補銘柄に該当する開示タイトルをClaudeへの入力に付加する。また、
  モメンタムベースの候補プールに入っていなくても株価インパクトが大きそうな
  開示（決算短信・業績予想の修正等）があった銘柄は、追加候補としてClaudeの
  評価対象に補完する（自動発注パイプラインには追加しない。あくまでClaudeの
  判断材料・通知への追加情報）。TDnet取得は非公式スクレイピングのため、
  失敗しても開示情報なしで処理を継続する（フェイルオープン）。

両モード共通（連続候補入りの加味）:
  daily_candidates は日付ごとに独立しており、素のままだとClaudeは「今日」の
  スコアしか見えず、同一銘柄が前日・前々日も候補入りしていた事実を知らない
  （実績上、複数日連続で強い銘柄をこれが原因で見逃すケースがあった）。
  直近7日分の候補履歴（score推移・選定有無）を各サマリーに付加し、
  「単発の急騰か、継続的な強さか」をClaude自身に判断させる。

発注可否・株数・損切りラインなどのハードなリスク判断は一切行わない。
ここでの役割はあくまで「一次選定」であり、失敗時は何もせず
（フェイルオープン）既存の候補リストがそのまま使われる。
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from src import db, notifier, tdnet_fetcher
from src.config import (
    ANTHROPIC_API_KEY,
    PRE_MARKET_LLM_DISCLOSURE_AFTER_HOUR,
    PRE_MARKET_LLM_DISCLOSURE_ENABLED,
    PRE_MARKET_LLM_DISCLOSURE_MAX_EXTRAS,
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
- disclosures: TDnet（適時開示情報閲覧サービス）で取得した、当日または前営業日引け後の
  適時開示タイトル一覧（例: "17:00 2027年３月期 第１四半期決算短信〔日本基準〕（連結）"）。
  存在しない銘柄にはこのフィールド自体がない
- score が null の銘柄は、モメンタムランキングには入っていないが上記の適時開示のみを
  理由に追加された銘柄（reasonsに「TDnet開示のみ」と記載）。気配値データはあるので
  同様に評価してよい
- recent_days: 直近7日間にこの銘柄が候補入りした日のscore推移（例: "appeared": 2,
  "selected": 1, "score_trend": [78.8, 76.2] は2日連続候補入り・うち1日選定済み・
  スコアは78.8→76.2で推移、という意味）。フィールド自体がない銘柄は直近7日間に
  候補入りしていない（今日が初出）

選定方針:
- expected_change_pct が負（下落予想）の銘柄は、値動きとして注目に値しても選ばないこと
- under_buy_qty/over_sell_qty が極端に薄いのに expected_change_pct だけ大きい銘柄は
  「見せ気配」の可能性を疑い、慎重に評価すること
- 買い優勢（imbalanceが正、buy_dominanceが高い）かつ数量も伴っている銘柄を優先すること
- disclosures がある銘柄は内容を読み、上方修正・増配・自己株式取得・好material提携等の
  好材料であれば加点、下方修正・特別損失・公募増資等の悪材料であれば減点（選定除外）
  すること。decision短信そのものは中立（数値を伴わないタイトルのみでは方向感なし）と
  扱い、他のタイトル（業績予想の修正等）が併記されている場合はそちらを優先判断すること
- recent_days がある銘柄は、単発の急騰と継続的な強さを区別する材料として使うこと。
  score_trend が横ばい〜上昇で複数日続いている銘柄は継続的な資金流入・注目度の
  高さを示すため積極的に評価してよい。逆にscore_trendが下降しているのに既に
  大きく上昇済みの銘柄は「息切れ」による反落リスクを疑い慎重に評価すること
  （連続候補入り＝常に買い、ではない点に注意）
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
- current_price: 前日終値（円）。null の場合は価格情報自体が取得できていない
  （後述のTDnet開示のみで追加された銘柄はこれに該当することが多い）
- disclosures: TDnet（適時開示情報閲覧サービス）で取得した、当日または前営業日引け後の
  適時開示タイトル一覧（例: "17:00 2027年３月期 第１四半期決算短信〔日本基準〕（連結）"）。
  存在しない銘柄にはこのフィールド自体がない
- score が null の銘柄は、モメンタムランキングには入っていないが上記の適時開示のみを
  理由に追加された銘柄（reasonsに「TDnet開示のみ」と記載）
- recent_days: 直近7日間にこの銘柄が候補入りした日のscore推移（例: "appeared": 2,
  "selected": 1, "score_trend": [78.8, 76.2] は2日連続候補入り・うち1日選定済み・
  スコアは78.8→76.2で推移、という意味）。フィールド自体がない銘柄は直近7日間に
  候補入りしていない（今日が初出）

選定方針:
- 複数のランキングに同時にランクインしている銘柄（reasonsに理由が複数ある銘柄）を優先すること
- 値上がり率のみでなく出来高・売買代金の急増を伴っている銘柄を優先すること
- disclosures がある銘柄は内容を読み、上方修正・増配・自己株式取得・好material提携等の
  好材料であれば加点、下方修正・特別損失・公募増資等の悪材料であれば減点（選定除外）
  すること。決算短信そのものは中立（数値を伴わないタイトルのみでは方向感なし）と扱うこと
- recent_days がある銘柄は、単発の急騰と継続的な強さを区別する材料として使うこと。
  score_trend が横ばい〜上昇で複数日続いている銘柄は継続的な資金流入・注目度の
  高さを示すため積極的に評価してよい。逆にscore_trendが下降しているのに既に
  大きく上昇済みの銘柄は「息切れ」による反落リスクを疑い慎重に評価すること
  （連続候補入り＝常に買い、ではない点に注意）
- current_price が null の銘柄（TDnet開示のみで追加）は価格未確認である旨を理由に含め、
  ユーザーが寄り付き前に必ず自分で株価を確認する前提で選定してよい
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


def _build_summary(
    client: KabuClient | None,
    symbol: str,
    symbol_name: str | None,
    score: float | None,
    reasons: str | None,
    current_price: float | None = None,
) -> dict | None:
    """1銘柄分のClaude入力用サマリーを作る。board取得に失敗した場合は None。"""
    if client is not None:
        indicative = _fetch_indicative(client, symbol)
        if indicative is None:
            return None
        return {
            "symbol":      symbol,
            "symbol_name": symbol_name or "",
            "score":       score,
            "reasons":     reasons,
            **indicative,
        }
    return {
        "symbol":        symbol,
        "symbol_name":   symbol_name or "",
        "score":         score,
        "reasons":       reasons,
        "current_price": current_price,
    }


def _fetch_disclosures() -> dict[str, list[dict]]:
    if not PRE_MARKET_LLM_DISCLOSURE_ENABLED:
        return {}
    try:
        return tdnet_fetcher.fetch_recent_disclosures(
            after_hour=PRE_MARKET_LLM_DISCLOSURE_AFTER_HOUR
        )
    except Exception as e:
        log.warning("TDnet開示取得に失敗しました（開示情報なしで継続）: %s", e)
        return {}


def run(
    client: KabuClient | None,
    notify: bool = True,
    include_disclosure_extras: bool = True,
    exclude_price_change_overlap: bool = False,
    universe_size: int | None = None,
) -> dict[str, str]:
    """寄り付き前フィルタを実行し、結果を daily_candidates に保存する。

    client が None の場合は /board を一切呼ばず、daily_candidates の
    score/reasons のみをもとに選定する（kabu API が全般的に使えない
    手動モード向け、およびザラ場中の定期再評価向け）。

    notify=False の場合はLINE通知を送らない（ザラ場中に短い間隔で
    繰り返し呼ぶ用途で、月間通知数の上限を消費しないようにするため）。

    include_disclosure_extras=False の場合、モメンタム候補プール外の
    TDnet開示のみ銘柄を評価対象に加えない。これらは daily_candidates に
    存在しないため llm_selected の保存が何も反映されず、自動発注
    パイプライン（ザラ場中の定期再評価）では評価コストが無駄になる。
    通知目的の寄り付き前フィルタでのみ True にする意味がある。

    exclude_price_change_overlap=True の場合、reasons に「値上がり率」を
    含む候補（経路Dのエントリー対象から既に除外済み＝trade_engine.py参照）
    を評価プールに入れない。screenerのscoreはこの重複を高く評価するため、
    素通しだと上位25件が実質取引不可能な銘柄で占められ、実際に経路Dで
    取引され得る銘柄がレビュー枠から常に弾き出されてしまう。

    universe_size: 評価対象の上限件数。None の場合は PRE_MARKET_LLM_UNIVERSE_SIZE。

    戻り値: {symbol: reason} の選定結果（該当なし・失敗時は {}）。
    """
    candidates = db.get_daily_candidates()
    if not candidates:
        log.warning("Claude寄り付き前フィルタ: 候補銘柄がありません。スキップします。")
        return {}

    if exclude_price_change_overlap:
        candidates = [c for c in candidates if "値上がり率" not in (c.get("reasons") or "")]

    pool = candidates[:(universe_size if universe_size is not None else PRE_MARKET_LLM_UNIVERSE_SIZE)]
    system_prompt = _SYSTEM_PROMPT_BOARD if client is not None else _SYSTEM_PROMPT_NO_BOARD
    empty_warning = (
        "気配値を取得できた銘柄がありませんでした。" if client is not None
        else "候補銘柄のスコアデータがありませんでした。"
    )

    disclosures_by_symbol = _fetch_disclosures()

    summaries: list[dict] = []
    evaluated_symbols: list[str] = []
    pool_symbols: set[str] = set()

    for c in pool:
        symbol = c.get("symbol")
        if not symbol:
            continue
        pool_symbols.add(symbol)
        summary = _build_summary(
            client, symbol, c.get("symbol_name"), c.get("score"), c.get("reasons"),
            c.get("current_price"),
        )
        if summary is None:
            continue
        evaluated_symbols.append(symbol)
        summaries.append(summary)

    # モメンタム候補プールに入っていないが、株価インパクトが大きそうな適時開示が
    # あった銘柄を追加候補として補完する（自動発注パイプラインには入れない。
    # あくまでClaudeの評価対象・通知への追加情報として扱う）。
    extra_added = 0
    if include_disclosure_extras and disclosures_by_symbol:
        for symbol in disclosures_by_symbol:
            if symbol in pool_symbols:
                continue
            if extra_added >= PRE_MARKET_LLM_DISCLOSURE_MAX_EXTRAS:
                break
            summary = _build_summary(client, symbol, "", None, "TDnet開示のみ（モメンタム候補外）")
            if summary is None:
                continue
            evaluated_symbols.append(symbol)
            summaries.append(summary)
            extra_added += 1
        if extra_added:
            log.info("TDnet開示により %d 銘柄を追加候補として補完しました", extra_added)

    for s in summaries:
        items = disclosures_by_symbol.get(s["symbol"])
        if items:
            s["disclosures"] = [f'{it["time"]} {it["title"]}' for it in items[:3]]

        history = db.get_recent_candidate_history(s["symbol"])
        if history:
            s["recent_days"] = {
                "appeared":    len(history),
                "selected":    sum(1 for h in history if h.get("llm_selected") == 1),
                "score_trend": [h["score"] for h in reversed(history)],
            }

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

    if notify:
        try:
            notifier.notify_llm_premarket_picks(selected)
        except Exception as e:
            log.warning("Claude選定結果の通知に失敗: %s", e)

    return selected
