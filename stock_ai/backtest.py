"""
過去の5分足データ（intraday_prices）を使った判定ロジックのバックテスト。

現行の trade_decision のルール（VWAP割れ・前日/寄り付き高安・出来高・ATR・
2本連続確認）をそのまま再利用し、銘柄ごと・日付ごとに「当日最初の5分足終値で
エントリーした場合」を1トレードとしてシミュレーションする。

簡略化している点（本番のリアルタイム判定との違い）:
  - エントリー価格は当日最初の5分足終値のみ（manual entry は対象外）
  - 前日高値・前日安値（previous_ohlc）は使わない（過去日分の日次データを
    都度取得するコストが大きいため）。前日ブレイク・前日ブレイク失速の
    判定は常に該当なしとして扱う
  - 市場地合い・注目銘柄ランキングによる補正は行わない（STAY/WATCHの
    最終ラベルには影響するが、TAKE_PROFIT/STOP_LOSSの確定条件には
    影響しないため、バックテストの主目的には不要と判断）
  - 監視終了時刻は本番と同じ 15:20 を採用する
"""

import logging
import sqlite3

import pandas as pd

from config import (
    ATR_NEAR_PCT as _ATR_NEAR_PCT,
    ATR_STOP_MULTIPLIER as _ATR_STOP_MULTIPLIER,
    DB_PATH,
    VWAP_NEAR_PCT as _VWAP_NEAR_PCT,
)
from monitoring import _TIME_LIMIT
from trade_decision import (
    _raw_condition,
    compute_atr,
    compute_metrics,
    compute_opening_range,
    decide_signal,
)

logger = logging.getLogger(__name__)


def load_intraday_prices(codes: list[str] | None = None) -> pd.DataFrame:
    """バックテスト対象の intraday_prices を DataFrame で返す（指定なければ全銘柄）"""
    conn = sqlite3.connect(DB_PATH)
    if codes:
        placeholders = ",".join("?" * len(codes))
        df = pd.read_sql_query(
            f"SELECT * FROM intraday_prices WHERE code IN ({placeholders}) ORDER BY code, datetime",
            conn, params=codes,
        )
    else:
        df = pd.read_sql_query("SELECT * FROM intraday_prices ORDER BY code, datetime", conn)
    conn.close()
    return df


def _simulate_trade(df_day: pd.DataFrame) -> dict | None:
    """
    1銘柄1日分の5分足データに対し、当日最初の終値でエントリーした場合の
    トレード結果（exit_reason, profit_pct, max_drawdown_pct）を返す。
    バーが2本未満の場合は None。
    """
    df_sorted = df_day.sort_values("datetime").reset_index(drop=True)
    if len(df_sorted) < 2:
        return None

    entry_price = float(df_sorted.iloc[0]["close"])
    peak_profit_pct = float("-inf")
    max_drawdown_pct = 0.0
    prev_raw: str | None = None
    confirmation_count = 0
    prev_opening_breakout = False

    exit_reason = "TIME_EXIT"
    exit_profit_pct = 0.0

    for i in range(len(df_sorted)):
        window = df_sorted.iloc[: i + 1]
        current_price = float(window.iloc[-1]["close"])
        current_dt = pd.to_datetime(window.iloc[-1]["datetime"])

        profit_pct = (current_price - entry_price) / entry_price * 100 if entry_price else 0.0
        peak_profit_pct = max(peak_profit_pct, profit_pct)

        metrics = compute_metrics(window)
        vwap = metrics["vwap"]

        opening_range = compute_opening_range(window)
        opening_30min_high = opening_range["opening_30min_high"]
        opening_30min_low = opening_range["opening_30min_low"]
        opening_range_breakout = bool(opening_30min_high is not None and current_price > opening_30min_high)
        opening_range_breakdown = bool(opening_30min_low is not None and current_price < opening_30min_low)
        opening_fade = bool(opening_30min_high is not None and prev_opening_breakout and not opening_range_breakout)

        atr_metrics = compute_atr(window)
        atr_14 = atr_metrics["atr_14"]
        if atr_14:
            atr_stop_price = entry_price - atr_14 * _ATR_STOP_MULTIPLIER
            atr_stop_loss_flag = bool(current_price < atr_stop_price)
        else:
            atr_stop_price = None
            atr_stop_loss_flag = False
        atr_near_flag = bool(
            atr_stop_price and not atr_stop_loss_flag
            and abs(current_price - atr_stop_price) / atr_stop_price <= _ATR_NEAR_PCT
        )
        vwap_near_flag = bool(vwap and abs(current_price - vwap) / vwap <= _VWAP_NEAR_PCT)

        raw = _raw_condition(
            profit_pct, current_price, vwap, False, opening_range_breakdown, atr_stop_loss_flag,
            peak_profit_pct,
        )
        if raw is not None and raw == prev_raw:
            confirmation_count += 1
        elif raw is not None:
            confirmation_count = 1
        else:
            confirmation_count = 0

        signal, _reason, _strength = decide_signal(
            profit_pct, current_price, vwap, metrics["volume_decline_flag"],
            metrics["bar_change_pct"], metrics["abnormal_volume_flag"], confirmation_count,
            raw, False, False,
            opening_range_breakout, opening_fade,
            metrics["volume_surge_continuation"], metrics["volume_fading"],
            atr_near_flag, atr_stop_price is not None, vwap_near_flag,
            peak_profit_pct,
        )

        max_drawdown_pct = max(max_drawdown_pct, peak_profit_pct - profit_pct)

        prev_raw = raw
        prev_opening_breakout = opening_range_breakout

        is_last_bar = (i == len(df_sorted) - 1)
        if signal == "TAKE_PROFIT":
            exit_reason, exit_profit_pct = "TAKE_PROFIT", profit_pct
            break
        if signal == "STOP_LOSS":
            exit_reason, exit_profit_pct = "STOP_LOSS", profit_pct
            break
        if current_dt.time() > _TIME_LIMIT or is_last_bar:
            exit_reason, exit_profit_pct = "TIME_EXIT", profit_pct
            break

    return {
        "exit_reason":      exit_reason,
        "profit_pct":       round(exit_profit_pct, 2),
        "max_drawdown_pct": round(max_drawdown_pct, 2),
    }


def run_backtest(codes: list[str] | None = None) -> dict:
    """
    intraday_prices に保存されている過去データを使ってバックテストを行う。
    返値は {"summary": dict, "trades": pd.DataFrame}。
    対象データが無い場合は summary=None, trades=空のDataFrame。
    """
    df_prices = load_intraday_prices(codes)
    if df_prices.empty:
        logger.warning("バックテスト: intraday_prices にデータがありません。")
        return {"summary": None, "trades": pd.DataFrame()}

    df_prices["date"] = pd.to_datetime(df_prices["datetime"]).dt.date.astype(str)

    trades = []
    for (code, trade_date), grp in df_prices.groupby(["code", "date"]):
        result = _simulate_trade(grp)
        if result is None:
            continue
        trades.append({"code": code, "date": trade_date, **result})

    df_trades = pd.DataFrame(trades)
    if df_trades.empty:
        logger.warning("バックテスト: シミュレーション可能なトレードがありませんでした。")
        return {"summary": None, "trades": df_trades}

    wins = df_trades[df_trades["profit_pct"] > 0]
    losses = df_trades[df_trades["profit_pct"] <= 0]
    total = len(df_trades)

    summary = {
        "total_trades":         total,
        "win_rate_pct":         round(len(wins) / total * 100, 2),
        "avg_profit_pct":       round(float(wins["profit_pct"].mean()), 2) if not wins.empty else 0.0,
        "avg_loss_pct":         round(float(losses["profit_pct"].mean()), 2) if not losses.empty else 0.0,
        "max_drawdown_pct":     round(float(df_trades["max_drawdown_pct"].max()), 2),
        "take_profit_rate_pct": round((df_trades["exit_reason"] == "TAKE_PROFIT").mean() * 100, 2),
        "stop_loss_rate_pct":   round((df_trades["exit_reason"] == "STOP_LOSS").mean() * 100, 2),
    }

    logger.info(
        "バックテスト完了: %d トレード（勝率%s%%, TAKE_PROFIT到達率%s%%, STOP_LOSS到達率%s%%）",
        total, summary["win_rate_pct"], summary["take_profit_rate_pct"], summary["stop_loss_rate_pct"],
    )

    return {"summary": summary, "trades": df_trades}


def _load_fundamental_momentum_codes(target_date: str | None = None) -> tuple[set[str], set[str]]:
    """
    analysis_results から決算モメンタムスコア(>0)の有無で銘柄コードを2分する。
    target_date 未指定時は analysis_results の最新日付を使う。
    データが無ければ (空集合, 空集合) を返す。
    """
    conn = sqlite3.connect(DB_PATH)
    try:
        if target_date is None:
            row = conn.execute("SELECT MAX(date) FROM analysis_results").fetchone()
            target_date = row[0] if row and row[0] else None
        if not target_date:
            return set(), set()

        df = pd.read_sql_query(
            "SELECT code, earnings_momentum_score FROM analysis_results WHERE date = ?",
            conn, params=(target_date,),
        )
    except Exception as e:
        logger.warning("決算モメンタムスコアの読み込みに失敗: %s", e)
        return set(), set()
    finally:
        conn.close()

    with_momentum = set(df[df["earnings_momentum_score"].fillna(0) > 0]["code"])
    without_momentum = set(df[df["earnings_momentum_score"].fillna(0) <= 0]["code"])
    return with_momentum, without_momentum


def run_backtest_with_fundamental_comparison(
    codes: list[str] | None = None, target_date: str | None = None,
) -> dict:
    """
    決算モメンタムスコア（EDINET）の有無で銘柄を分け、それぞれ個別にバックテストする。
    analysis_results にデータが無い場合は、両グループとも対象銘柄0件として返す。
    返値: {"with_momentum": run_backtest()の返値, "without_momentum": run_backtest()の返値}
    """
    with_momentum, without_momentum = _load_fundamental_momentum_codes(target_date)

    if codes:
        with_momentum = with_momentum & set(codes)
        without_momentum = without_momentum & set(codes)

    if not with_momentum and not without_momentum:
        logger.warning("決算モメンタムスコアのデータが無いため比較バックテストは実施できません。")

    logger.info(
        "決算モメンタム比較バックテスト: あり %d 銘柄 / なし %d 銘柄",
        len(with_momentum), len(without_momentum),
    )

    empty_result = {"summary": None, "trades": pd.DataFrame()}
    return {
        "with_momentum":    run_backtest(sorted(with_momentum)) if with_momentum else empty_result,
        "without_momentum": run_backtest(sorted(without_momentum)) if without_momentum else empty_result,
    }
