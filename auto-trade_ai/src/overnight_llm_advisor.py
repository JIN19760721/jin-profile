"""
翌日仕込み候補アドバイザー（オーバーナイト候補通知）。

15:15頃（東証引け15:30より前）に、当日の値動き・出来高データと
TDnet適時開示をもとに、Claudeに「翌日に向けて本日のうちに仕込んでおくと
面白そうな銘柄」を選ばせ、LINEへ通知するだけの助言専用機能。

自動発注・自動EXITは一切行わない。実際に買うかどうかはユーザーが
この通知を見て自分で判断・発注する。資金管理・ポジション管理・
リスク判定（risk_manager等）とは完全に独立しており、既存の経路D
（デイトレード）の判定フローには一切影響しない。

データソース: db.get_daily_candidates()（当日のスクリーニングスコア・
surge関連フィールドを含む。追加のkabu API通信は発生しない）+
TDnet適時開示（tdnet_fetcher.py、非公式スクレイピング・フェイルオープン）。
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from src import db, notifier, tdnet_fetcher
from src.config import (
    ANTHROPIC_API_KEY,
    OVERNIGHT_ADVISOR_MODEL,
    OVERNIGHT_ADVISOR_TOP_N,
    OVERNIGHT_ADVISOR_UNIVERSE_SIZE,
    PRE_MARKET_LLM_DISCLOSURE_AFTER_HOUR,
    PRE_MARKET_LLM_DISCLOSURE_ENABLED,
)

log = logging.getLogger(__name__)


class _Pick(BaseModel):
    symbol: str
    reason: str


class _Picks(BaseModel):
    picks: list[_Pick]


_SYSTEM_PROMPT = """あなたは日本株のオーバーナイト（翌日への持ち越し）候補選定を補助する
アシスタントです。これは自動発注ではなく、ユーザーへの参考情報の提示です。
実際に買うかどうか・いつ買うかはユーザー自身が判断します。

このシステムは「本日の引け（大引け）にかけて仕込み、翌営業日に上昇する
可能性が高い銘柄」を絞り込むためのものです。オーバーナイト保有は、
翌朝の寄り付きで想定と逆方向に価格が飛ぶ「ギャップリスク」を伴う点を
踏まえて評価してください。

渡されるデータは15:15頃時点（大引け直前）のものです:
- score / reasons: 本日の値上がり率・出来高等ランキングに基づく
  スクリーニングスコアと根拠
- current_price: 直近ポーリング時点の株価
- surge_score / surge_signal: 出来高先行の急騰予兆スコア・状態
  （PRE_SURGE_SETUP等。本システムの日中デイトレード判定で使われている指標）
- vwap_position: VWAPからの乖離率(%)。正の値はVWAPより上で推移していることを示す
- near_day_high_ratio: 当日高値に対する現在値の比率。1に近いほど
  高値圏で引けようとしていることを示す
- volume_spike_ratio / turnover_spike_ratio: 20日平均に対する出来高・
  売買代金の急増倍率
- price_change_1m / price_change_3m / price_change_5m: 直近の値動き(%)。
  マイナスなら直近で反落中であることを示す
- disclosures: TDnet（適時開示情報閲覧サービス）で取得した当日の適時開示
  タイトル一覧。ただし15:15時点では本日引け後（15:30以降）に出る開示の
  多くはまだ反映されていない点に注意すること
- recent_days: 直近7日間にこの銘柄が候補入りした日のscore推移

選定方針:
- near_day_high_ratio が1に近く、vwap_position が正（VWAP上）で、
  出来高・売買代金の急増が引けにかけても続いている銘柄を優先すること
  （＝本日の強さが「見せかけ」ではなく引けまで持続している銘柄）
- price_change_1m/3m/5m がマイナス（直近で反落中）の銘柄は、日中早い
  時間に急騰したあと息切れしている可能性が高いため慎重に評価し、
  基本的には選ばないこと
- disclosures に好材料（上方修正・増配・自己株式取得等）があれば加点、
  悪材料（下方修正・特別損失等）があれば選定除外すること
- recent_days で複数日連続して強い銘柄は、継続的な資金流入の材料として
  積極的に評価してよい
- 該当する銘柄が top_n に満たない場合、無理に埋めずに該当なしのままでよい
- 実際の発注可否・株数・損切りラインなどはユーザー自身が判断するため、
  ここでは「翌日に向けて本日仕込む価値がある銘柄の絞り込みと理由」のみを
  行うこと（1銘柄につき理由は1〜2行程度で、なぜ引けまで強さが続いている
  と判断したかが分かるように書くこと）
"""


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


def _build_summary(c: dict) -> dict:
    return {
        "symbol":               c.get("symbol"),
        "symbol_name":          c.get("symbol_name") or "",
        "score":                c.get("score"),
        "reasons":              c.get("reasons"),
        "current_price":        c.get("current_price"),
        "surge_score":          c.get("surge_score"),
        "surge_signal":         c.get("surge_signal"),
        "vwap_position":        c.get("vwap_position"),
        "near_day_high_ratio":  c.get("near_day_high_ratio"),
        "volume_spike_ratio":   c.get("volume_spike_ratio"),
        "turnover_spike_ratio": c.get("turnover_spike_ratio"),
        "price_change_1m":      c.get("price_change_1m"),
        "price_change_3m":      c.get("price_change_3m"),
        "price_change_5m":      c.get("price_change_5m"),
    }


def _call_claude(summaries: list[dict], top_n: int, model: str) -> list[dict] | None:
    """Claude に候補一覧を渡して上位 top_n 件を選ばせる。失敗時は None（フェイルオープン）。"""
    if not ANTHROPIC_API_KEY:
        log.warning("ANTHROPIC_API_KEY が未設定のため翌日仕込み候補アドバイザーをスキップします")
        return None

    try:
        import anthropic
    except ImportError:
        log.warning("anthropic パッケージが未インストールのため翌日仕込み候補アドバイザーをスキップします")
        return None

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    user_content = (
        f"以下は本日15:15頃時点の候補銘柄（{len(summaries)}件）のデータです。"
        f"翌日に向けて本日のうちに仕込んでおくと面白そうな銘柄を上位{top_n}件以内で選び、"
        f"各銘柄1〜2行で理由を付けてください。\n\n"
        + json.dumps(summaries, ensure_ascii=False, indent=2)
    )

    try:
        response = client.messages.parse(
            model=model,
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=_SYSTEM_PROMPT,
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


def run(dry_run: bool = False) -> dict[str, str]:
    """翌日仕込み候補アドバイザーを実行し、結果をLINE通知する。

    自動発注は行わない。失敗時（候補なし・Claude呼び出し失敗等）は
    何も通知せずログ警告のみで終了する（フェイルオープン）。

    戻り値: {symbol: reason} の選定結果（該当なし・失敗時は {}）。
    """
    candidates = db.get_daily_candidates()
    if not candidates:
        log.warning("翌日仕込み候補アドバイザー: 候補銘柄がありません。スキップします。")
        return {}

    pool = candidates[:OVERNIGHT_ADVISOR_UNIVERSE_SIZE]
    disclosures_by_symbol = _fetch_disclosures()

    summaries: list[dict] = []
    for c in pool:
        symbol = c.get("symbol")
        if not symbol:
            continue
        summary = _build_summary(c)

        items = disclosures_by_symbol.get(symbol)
        if items:
            summary["disclosures"] = [f'{it["time"]} {it["title"]}' for it in items[:3]]

        history = db.get_recent_candidate_history(symbol)
        if history:
            summary["recent_days"] = {
                "appeared":    len(history),
                "selected":    sum(1 for h in history if h.get("llm_selected") == 1),
                "score_trend": [h["score"] for h in reversed(history)],
            }

        summaries.append(summary)

    if not summaries:
        log.warning("翌日仕込み候補アドバイザー: 有効な候補がありませんでした。スキップします。")
        return {}

    picks = _call_claude(summaries, OVERNIGHT_ADVISOR_TOP_N, OVERNIGHT_ADVISOR_MODEL)
    if picks is None:
        log.warning("翌日仕込み候補アドバイザー: Claude呼び出しに失敗したため、今回は通知しません。")
        return {}

    selected = {p["symbol"]: p["reason"] for p in picks}

    log.info(
        "翌日仕込み候補アドバイザー完了: %d件中%d件を選定",
        len(summaries), len(selected),
    )
    for sym, reason in selected.items():
        log.info("  [選定] %s: %s", sym, reason)

    try:
        notifier.notify_overnight_picks(selected, dry_run=dry_run)
    except Exception as e:
        log.warning("翌日仕込み候補の通知に失敗: %s", e)

    return selected
