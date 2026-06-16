"""
メインエントリーポイント。

処理フロー:
  1. DB 初期化
  2. J-Quants: 上場銘柄一覧取得 → DB 保存（403 時は既存 DB からコード取得）
  3. yfinance: 全日本株の直近 N 日分を取得 → daily_quotes に保存
  4. yfinance: 市場指数・為替・BTC 取得 → market_indices に保存
  5. 分析実行（対象日 = DB 最新日 または --date 指定）
  6. Excel 出力

使い方:
  python main.py
  python main.py --date 2026-03-24
  python main.py --period 60d          # 取得期間を変更（デフォルト 30d）
  python main.py --skip-fetch          # DB にデータがある状態で分析のみ実行
"""

import argparse
import logging
import sys

import pandas as pd

from config import DUPLICATE_SUPPRESS_WINDOW_MINUTES as _DUPLICATE_SUPPRESS_WINDOW_MINUTES
from config import LOGS_DIR, last_business_day

_DEFAULT_PERIOD = "30d"

# LINE通知対象シグナル（STAYは対象外。同一シグナル継続もここでは送らない）
_NOTIFY_SIGNALS = {"ENTRY", "WATCH", "WATCH_STRONG", "TAKE_PROFIT", "STOP_LOSS"}

# 重複通知抑制（_DUPLICATE_SUPPRESS_WINDOW_MINUTES、settings.yaml で変更可）の
# 対象から除外する（緊急性が高いため、直近の重複に関わらず必ず通知する）
_ALWAYS_NOTIFY_SIGNALS = {"STOP_LOSS", "TAKE_PROFIT", "WATCH_STRONG"}


def _is_recent_duplicate_notification(code: str, signal: str, signal_datetime_str: str) -> bool:
    """直近 _DUPLICATE_SUPPRESS_WINDOW_MINUTES 分以内に同一銘柄・同一シグナルの
    変化イベントが既にあったかどうかを返す（LINE通知の重複抑制用）"""
    from datetime import datetime, timedelta

    from db import get_recent_changed_signal

    current_dt = datetime.strptime(signal_datetime_str, "%Y-%m-%d %H:%M:%S")
    since = (current_dt - timedelta(minutes=_DUPLICATE_SUPPRESS_WINDOW_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    return get_recent_changed_signal(code, signal, since, signal_datetime_str) is not None


def _build_line_message(history_row, signal_row) -> str:
    prev_label = history_row["previous_signal"] if history_row["previous_signal"] else "(初回)"
    return (
        f"【デイトレ判定】\n"
        f"{history_row['code']}\n\n"
        f"{prev_label} → {history_row['current_signal']}\n\n"
        f"現在値：{signal_row['current_price']}円\n"
        f"買値：{signal_row['entry_price']}円\n"
        f"損益率：{signal_row['profit_pct']:+.1f}%\n\n"
        f"理由：\n{history_row['reason']}\n\n"
        f"リスク：{signal_row.get('risk_level', '')}"
    )


def setup_logging(log_date: str):
    log_file = LOGS_DIR / f"run_{log_date}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file, encoding="utf-8"),
        ],
    )


def _fetch_companies_or_fallback(logger) -> list[str]:
    """
    J-Quants から上場銘柄を取得してコードリストを返す。
    403 / 失敗時は既存 DB の listed_companies からコードを取得する。
    """
    from fetch_jquants import fetch_listed_companies
    from db import upsert_companies, get_all_codes

    try:
        companies = fetch_listed_companies()
        if companies:
            upsert_companies(companies)
            codes = [c["code"] for c in companies]
            logger.info("J-Quants: 上場銘柄 %d 件取得", len(codes))
            return codes
        logger.warning("J-Quants: 銘柄一覧が空でした")
    except Exception as e:
        logger.warning("J-Quants 銘柄取得失敗: %s", e)

    # フォールバック: DB から取得
    codes = get_all_codes()
    if codes:
        logger.info("DB の既存銘柄リストを使用: %d 件", len(codes))
    else:
        logger.error("DB にも銘柄データがありません。J-Quants 認証を確認してください。")
    return codes


def run_intraday_mode(args, logger):
    """
    5分足モニタリングモード: 指定銘柄の5分足を取得し、エントリー価格に対する
    損益率を計算して DB/Excel に保存する。注目銘柄ランキング機能とは独立したフロー。
    """
    from db import init_db
    init_db()

    if args.stop_codes:
        from datetime import datetime as _datetime

        from code_parser import parse_codes
        from db import stop_monitoring
        from monitoring import STOP_REASON_MANUAL

        stop_codes = parse_codes(args.stop_codes)
        if not stop_codes:
            logger.error("--stop-codes には有効な4桁銘柄コードを指定してください。")
            sys.exit(1)

        now_str = _datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for code in stop_codes:
            stop_monitoring(code, STOP_REASON_MANUAL, now_str)
        logger.info("手動で監視終了しました: %s", stop_codes)
        return

    if args.resume_codes:
        from datetime import datetime as _datetime

        from code_parser import parse_codes
        from db import get_stopped_codes, resume_monitoring

        resume_codes = parse_codes(args.resume_codes)
        if not resume_codes:
            logger.error("--resume-codes には有効な4桁銘柄コードを指定してください。")
            sys.exit(1)

        stopped_codes = get_stopped_codes()
        now_str = _datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for code in resume_codes:
            if code not in stopped_codes:
                logger.info("銘柄 %s: 監視終了されていないため再開対象外です。", code)
                continue
            resume_monitoring(code, now_str)
        logger.info("監視再開を処理しました: %s", resume_codes)
        return

    from code_parser import parse_codes

    codes = parse_codes(args.codes or [])
    if not codes:
        logger.error("--intraday には --codes で有効な4桁銘柄コードを指定してください。")
        sys.exit(1)

    from db import get_stopped_codes
    stopped_codes = get_stopped_codes()
    excluded_codes = [c for c in codes if c in stopped_codes]
    codes = [c for c in codes if c not in stopped_codes]
    if excluded_codes:
        logger.info("監視終了済みのため対象から除外: %s", excluded_codes)
    if not codes:
        logger.warning("対象銘柄がすべて監視終了済みのため処理を終了します。")
        return

    logger.info("=" * 60)
    logger.info("5分足モニタリング 開始 (codes=%s, entry-mode=%s)", codes, args.entry_mode)
    logger.info("=" * 60)

    from intraday_monitor import run_intraday_fetch, run_intraday_positions
    df_prices = run_intraday_fetch(codes)

    if df_prices.empty:
        logger.warning("5分足データを取得できませんでした。")
        return

    try:
        df_positions = run_intraday_positions(df_prices, args.entry_mode)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)

    if df_positions.empty:
        logger.warning("損益計算結果がありませんでした。")

    from intraday_monitor import fetch_previous_day_ohlc_for_codes
    previous_ohlc = fetch_previous_day_ohlc_for_codes(codes)

    from fetch_yfinance import classify_market_sentiment, fetch_market_snapshot
    from db import upsert_market_indices
    market_snapshot = fetch_market_snapshot()
    if market_snapshot:
        upsert_market_indices([
            {"symbol": symbol, **{k: v for k, v in data.items() if k != "change_pct"}}
            for symbol, data in market_snapshot.items()
        ])
    market_sentiment = classify_market_sentiment(market_snapshot)
    logger.info(
        "市場環境: %s (主要4指数平均前日比 %s%%)",
        market_sentiment.get("market_sentiment") or "判定不可",
        market_sentiment.get("market_change_pct"),
    )

    from trade_decision import run_trade_decision
    df_signals, df_history = run_trade_decision(df_prices, df_positions, previous_ohlc, market_sentiment)

    # 監視終了条件（TAKE_PROFIT/STOP_LOSS確定・15:20超過・出来高大幅減少）の判定。
    # 終了した銘柄は monitoring_status に記録され、次回以降の --intraday 対象から除外される。
    from db import stop_monitoring
    from monitoring import evaluate_stop_condition
    for _, row in df_signals.iterrows():
        stop_reason = evaluate_stop_condition(row["signal"], row["signal_datetime"], bool(row.get("volume_fading")))
        if stop_reason:
            stop_monitoring(row["code"], stop_reason, row["signal_datetime"])
            logger.info(
                "銘柄 %s: 監視終了条件に合致（%s）。次回以降は監視対象から除外します。",
                row["code"], stop_reason,
            )

    # LINE通知の判定は signal_history.changed_flag を正とする
    # （trade_signals.signal_changed は後方互換のため残しているが非推奨）。
    signals_by_code = {row["code"]: row for _, row in df_signals.iterrows()}

    from line_notify import send_line_message
    for _, row in df_history.iterrows():
        changed_flag = bool(row["changed_flag"])
        if changed_flag:
            prev_label = row["previous_signal"] if row["previous_signal"] else "(初回)"
            logger.info(
                "[CHANGE]\n%s\n%s → %s\n\n理由：\n%s",
                row["code"], prev_label, row["current_signal"], row["reason"],
            )

        if args.notify_line and changed_flag and row["current_signal"] in _NOTIFY_SIGNALS:
            signal = row["current_signal"]
            if signal not in _ALWAYS_NOTIFY_SIGNALS and _is_recent_duplicate_notification(
                row["code"], signal, row["signal_datetime"]
            ):
                logger.info(
                    "銘柄 %s: 直近%d分以内に同一シグナル(%s)を通知済みのためLINE通知をスキップ",
                    row["code"], _DUPLICATE_SUPPRESS_WINDOW_MINUTES, signal,
                )
                continue

            signal_row = signals_by_code.get(row["code"])
            if signal_row is not None:
                send_line_message(_build_line_message(row, signal_row))

    # 買いエントリー候補（entry_candidate）の変化検知・通知は、上記のsignal通知とは
    # 完全に別管理（notifier.py）で扱う。trade_signals.signal / signal_history は変更しない。
    import notifier
    from db import get_company_name, get_latest_entry_candidate, upsert_entry_candidate_history

    entry_history_rows = []
    for _, row in df_signals.iterrows():
        code = row["code"]
        prev_entry = get_latest_entry_candidate(code)
        previous_entry_candidate = prev_entry["current_entry_candidate"] if prev_entry else None
        current_entry_candidate = row["entry_candidate"]
        changed_flag = notifier.compute_entry_candidate_changed_flag(previous_entry_candidate, current_entry_candidate)
        reason = row["entry_factors"] or "条件に該当なし"

        entry_history_rows.append({
            "code":                      code,
            "signal_datetime":           row["signal_datetime"],
            "previous_entry_candidate":  previous_entry_candidate,
            "current_entry_candidate":   current_entry_candidate,
            "changed_flag":              int(changed_flag),
            "entry_score":               row["entry_score"],
            "entry_factors":             row["entry_factors"],
            "reason":                    reason,
        })

        if changed_flag:
            logger.info(
                "[ENTRY_CANDIDATE_CHANGE]\n%s\n%s → %s (ENTRY_SCORE=%s)",
                code, previous_entry_candidate or "(初回)", current_entry_candidate, row["entry_score"],
            )

        if args.notify_line and notifier.should_notify_entry_candidate(current_entry_candidate, changed_flag):
            company_name = get_company_name(code)
            send_line_message(notifier.build_entry_candidate_message(
                code, company_name, row["entry_score"], row["entry_factors"]
            ))

    if entry_history_rows:
        upsert_entry_candidate_history(entry_history_rows)
    df_entry_history = pd.DataFrame(entry_history_rows)

    from datetime import datetime
    from export_excel import export_intraday_excel
    run_dt = datetime.now().strftime("%Y-%m-%d_%H%M")
    out_path = export_intraday_excel(df_prices, run_dt, df_positions, df_signals, df_history, df_entry_history)
    logger.info("出力先: %s", out_path)

    logger.info("=" * 60)
    logger.info("処理完了")
    logger.info("=" * 60)


def run_daily_report_mode(args, logger):
    """
    取引終了後の日次監視レポートを作成する。当日（または --date 指定日）の
    trade_signals を銘柄ごとに集計し、Excel に出力する。
    """
    from datetime import date as _date
    target_date = args.date or str(_date.today())

    logger.info("=" * 60)
    logger.info("日次監視レポート作成 (対象日=%s)", target_date)
    logger.info("=" * 60)

    from db import init_db
    init_db()

    from daily_report import build_daily_report
    df_report = build_daily_report(target_date)

    if df_report.empty:
        logger.warning("対象日 %s のデータがないため日次監視レポートを作成できませんでした。", target_date)
        return

    from export_excel import export_daily_report_excel
    out_path = export_daily_report_excel(df_report, target_date)
    logger.info("日次監視レポート出力先: %s", out_path)

    logger.info("=" * 60)
    logger.info("処理完了")
    logger.info("=" * 60)


def run_backtest_mode(args, logger):
    """
    過去の intraday_prices データを使って現行の判定ロジックをバックテストする。
    --codes を指定すればその銘柄のみ、未指定なら保存済みの全銘柄が対象。
    """
    logger.info("=" * 60)
    logger.info("バックテスト開始 (codes=%s)", args.codes or "全銘柄")
    logger.info("=" * 60)

    from db import init_db
    init_db()

    codes = None
    if args.codes:
        from code_parser import parse_codes
        codes = parse_codes(args.codes)
        if not codes:
            logger.error("--backtest で --codes を指定する場合は有効な4桁銘柄コードが必要です。")
            sys.exit(1)

    from backtest import run_backtest
    result = run_backtest(codes)
    summary = result["summary"]
    df_trades = result["trades"]

    if summary is None:
        logger.warning("バックテスト対象データがありませんでした。")
        return

    logger.info(
        "総トレード数=%d 勝率=%s%% 平均利益率=%s%% 平均損失率=%s%% "
        "最大ドローダウン=%s%% TAKE_PROFIT到達率=%s%% STOP_LOSS到達率=%s%%",
        summary["total_trades"], summary["win_rate_pct"], summary["avg_profit_pct"],
        summary["avg_loss_pct"], summary["max_drawdown_pct"],
        summary["take_profit_rate_pct"], summary["stop_loss_rate_pct"],
    )

    from datetime import datetime
    from export_excel import export_backtest_excel
    run_dt = datetime.now().strftime("%Y-%m-%d_%H%M")
    out_path = export_backtest_excel(summary, df_trades, run_dt)
    logger.info("バックテスト結果出力先: %s", out_path)

    logger.info("=" * 60)
    logger.info("処理完了")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="日本株注目銘柄 自動抽出ツール")
    parser.add_argument("--date",   help="分析対象日 (YYYY-MM-DD, 省略時は取得データの最新日)")
    parser.add_argument("--period", default=_DEFAULT_PERIOD, help=f"yfinance 取得期間 (例: 30d, 60d, デフォルト: {_DEFAULT_PERIOD})")
    parser.add_argument("--skip-fetch", action="store_true", help="データ取得をスキップし分析のみ実行")
    parser.add_argument("--intraday", action="store_true", help="5分足モニタリングモードで実行（注目銘柄抽出は行わない）")
    parser.add_argument("--codes", nargs="+", help="--intraday 時の対象銘柄コード（最大5件、4桁数字、例: 7203 3778 5253）")
    parser.add_argument("--entry-mode", choices=["first_close", "manual"], default="first_close",
                         help="エントリー価格の決定方法 (デフォルト: first_close)")
    parser.add_argument("--notify-line", action="store_true", help="シグナル変化時にLINE Notifyで通知する（指定しない場合はログのみ）")
    parser.add_argument("--stop-codes", nargs="+", help="指定銘柄の監視を手動で終了する（4桁数字。--intraday と併用、他のオプションは無視される）")
    parser.add_argument("--resume-codes", nargs="+", help="監視終了済みの指定銘柄を再開する（4桁数字。--intraday と併用、他のオプションは無視される）")
    parser.add_argument("--daily-report", action="store_true", help="取引終了後の日次監視レポートをExcel出力する（--dateで対象日を指定可、省略時は本日）")
    parser.add_argument("--backtest", action="store_true", help="過去のintraday_pricesデータで判定ロジックをバックテストする（--codesで対象銘柄を指定可、省略時は全銘柄）")
    args = parser.parse_args()

    # ログ用の日付（分析前なので暫定で today を使用）
    from datetime import date as _date
    setup_logging(str(_date.today()))
    logger = logging.getLogger("main")

    if args.backtest:
        run_backtest_mode(args, logger)
        return

    if args.daily_report:
        run_daily_report_mode(args, logger)
        return

    if args.intraday:
        run_intraday_mode(args, logger)
        return

    logger.info("=" * 60)
    logger.info("日本株注目銘柄 自動抽出ツール 開始")
    logger.info("=" * 60)

    # ── Step 0: DB 初期化 ─────────────────────────────────────
    logger.info("[Step 0] DB 初期化")
    from db import init_db
    init_db()

    if not args.skip_fetch:
        # ── Step 1: J-Quants 認証確認 ────────────────────────
        logger.info("[Step 1] J-Quants 認証確認")
        try:
            from fetch_jquants import validate_credentials
            validate_credentials()
        except ValueError as e:
            logger.warning(str(e))

        # ── Step 2: 上場銘柄一覧取得（403 時は DB フォールバック）
        logger.info("[Step 2] 上場銘柄一覧取得")
        codes = _fetch_companies_or_fallback(logger)
        if not codes:
            logger.error("分析対象銘柄が取得できませんでした。処理を中断します。")
            sys.exit(1)

        # ── Step 3: yfinance で日本株日次株価取得 ────────────
        logger.info("[Step 3] 日本株日次株価取得 (yfinance, period=%s)", args.period)
        try:
            from fetch_yfinance import fetch_japanese_stocks_from_yfinance
            from db import upsert_daily_quotes
            jpy_quotes = fetch_japanese_stocks_from_yfinance(codes, period=args.period)
            if jpy_quotes:
                upsert_daily_quotes(jpy_quotes)
                logger.info("日本株株価保存: %d 件", len(jpy_quotes))
            else:
                logger.warning("日本株の株価データが取得できませんでした")
        except Exception as e:
            logger.error("日本株株価取得失敗: %s", e, exc_info=True)

        # ── Step 4: yfinance 市場指数取得 ─────────────────────
        logger.info("[Step 4] 市場指数取得 (yfinance)")
        try:
            from fetch_yfinance import fetch_market_indices
            from db import upsert_market_indices
            indices = fetch_market_indices(days=5)
            if indices:
                upsert_market_indices(indices)
            else:
                logger.warning("市場指数データが取得できませんでした")
        except Exception as e:
            logger.error("市場指数取得失敗: %s", e)

    # ── 分析対象日の決定 ──────────────────────────────────────
    if args.date:
        target_date = args.date
    else:
        from db import get_latest_quote_date
        target_date = get_latest_quote_date() or last_business_day()
    logger.info("分析対象日: %s", target_date)

    # ── Step 5: 分析実行 ──────────────────────────────────────
    logger.info("[Step 5] 分析実行")
    try:
        from analyze import run_analysis
        from db import upsert_analysis_results
        df_result = run_analysis(target_date)

        if not df_result.empty:
            upsert_analysis_results(df_result.to_dict("records"))
            logger.info("注目銘柄: %d 件抽出", len(df_result))
        else:
            logger.warning("注目銘柄が抽出されませんでした")
    except Exception as e:
        logger.error("分析失敗: %s", e, exc_info=True)
        df_result = __import__("pandas").DataFrame()

    # ── Step 6: Excel 出力 ────────────────────────────────────
    logger.info("[Step 6] Excel 出力")
    try:
        from export_excel import export_to_excel
        out_path = export_to_excel(df_result, target_date)
        logger.info("出力先: %s", out_path)
    except Exception as e:
        logger.error("Excel 出力失敗: %s", e, exc_info=True)

    logger.info("=" * 60)
    logger.info("処理完了")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
