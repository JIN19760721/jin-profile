"""
kabuステーション デイトレ候補銘柄抽出ツール / 自動売買エンジン / リアルタイムモニター

使い方:
  # 銘柄スクリーニング
  python -m src.main
  python -m src.main --exchange TP --top 30

  # 自動売買（検証モード）
  python -m src.main --trade --dry-run

  # 自動売買（本番）
  python -m src.main --trade

  # リアルタイム株価予測モニター（発注なし）
  python -m src.main --monitor
"""

import argparse
import logging
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from src.config import EXCHANGE_DIVISION, TRADE_EXCHANGE
from src.exporter import OUTPUT_PATH, export_csv
from src.kabu_client import KabuClient
from src.ranking_fetcher import fetch_all_rankings
from src.screener import merge_and_score

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("main")


def _fmt_price(val) -> str:
    return f"{val:.1f}" if val is not None else "  ----"


def _fmt_pct(val) -> str:
    return f"{val:+.2f}%" if val is not None else "   ----"


def _print_table(candidates: list[dict], top: int, exchange: str) -> None:
    width = 115
    print(f"\n{'=' * width}")
    print(f"  デイトレ候補銘柄 上位 {top} 件  [ExchangeDivision={exchange}]")
    print(f"{'=' * width}")
    print(
        f"{'#':>3}  {'Symbol':<6}  {'銘柄名':<20}  "
        f"{'現在値':>8}  {'前日比':>7}  {'予想騰落率':>9}  {'score':>6}  理由"
    )
    print("-" * width)
    for i, c in enumerate(candidates[:top], 1):
        print(
            f"{i:>3}  {c['Symbol']:<6}  {(c['SymbolName'] or '')[:20]:<20}  "
            f"{_fmt_price(c.get('CurrentPrice')):>8}  "
            f"{_fmt_pct(c.get('ChangePercentage')):>7}  "
            f"{_fmt_pct(c.get('predicted_change_pct')):>9}  "
            f"{c['score']:>6.1f}  {c['reasons']}"
        )
    print(f"{'=' * width}\n")


def run_screener(args) -> None:
    log.info(
        "=== kabu候補銘柄抽出 開始 (exchange=%s, top=%d) ===",
        args.exchange, args.top,
    )

    client = KabuClient()
    try:
        client.authenticate()
    except (ConnectionError, RuntimeError, ValueError) as e:
        log.error("認証エラー: %s", e)
        sys.exit(1)

    rankings = fetch_all_rankings(client, args.exchange)

    if all(len(v) == 0 for v in rankings.values()):
        log.warning(
            "すべてのランキングが空でした。"
            "kabuステーションが起動中か、取引時間内かを確認してください。"
        )
        sys.exit(0)

    candidates = merge_and_score(rankings)

    if not candidates:
        log.warning(
            "スコアリング後の候補銘柄がありませんでした。"
            "MIN_TRADING_VOLUME の設定値（現在: %d）が高すぎる可能性があります。",
            __import__("src.config", fromlist=["MIN_TRADING_VOLUME"]).MIN_TRADING_VOLUME,
        )
        sys.exit(0)

    log.info("候補銘柄: %d 件（フィルタ後）", len(candidates))
    _print_table(candidates, args.top, args.exchange)
    export_csv(candidates, OUTPUT_PATH)
    log.info("=== 処理完了 ===")


def _wait_for_kabu_station(client: KabuClient, max_wait_min: int = 10) -> bool:
    """kabu station の起動を確認する。最大 max_wait_min 分待機してリトライする。"""
    import time

    interval = 60
    for attempt in range(1, max_wait_min + 1):
        try:
            client.authenticate()
            if attempt > 1:
                log.info("kabu station 接続確認 OK (試行 %d)", attempt)
            return True
        except Exception as e:
            err = str(e).lower()
            if any(k in err for k in ("connection", "refused", "timeout", "connect")):
                # 接続自体が失敗 → kabu station 未起動の可能性
                log.warning(
                    "kabu station 未起動の可能性 (試行 %d/%d) — %d 秒後に再確認します。起動を確認してください。",
                    attempt, max_wait_min, interval,
                )
            else:
                # 接続はできているが認証失敗（パスワード誤りなど） → 即エラー
                log.error("kabu station 認証エラー: %s", e)
                return False
        if attempt < max_wait_min:
            time.sleep(interval)

    log.error(
        "kabu station に %d 分間接続できませんでした。kabuステーションの起動を確認してください。",
        max_wait_min,
    )
    return False


def run_trade(args) -> None:
    import jpholiday
    from datetime import date as _date

    if jpholiday.is_holiday(_date.today()):
        log.info("本日は祝日のため自動売買をスキップします。")
        return

    from src.trade_engine import TradeEngine

    mode = "DRY-RUN" if args.dry_run else "本番"
    log.info("=== 自動売買モード 開始 [%s] ===", mode)

    if args.exchange != EXCHANGE_DIVISION:
        log.warning(
            "--exchange %s は自動売買モードでは無視されます（取引所フィルタは settings.yaml の trade.exchange=%s を使用）",
            args.exchange, TRADE_EXCHANGE,
        )

    client = KabuClient()
    if not _wait_for_kabu_station(client):
        sys.exit(1)

    engine = TradeEngine(client, dry_run=args.dry_run)
    engine.run()


def run_monitor(args) -> None:
    from src import realtime_monitor

    log.info("=== リアルタイムモニター 開始 (Exchange=%s) ===", args.exchange)

    client = KabuClient()
    try:
        client.authenticate()
    except (ConnectionError, RuntimeError, ValueError) as e:
        log.error("認証エラー: %s", e)
        sys.exit(1)

    realtime_monitor.run(client)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="kabuステーション デイトレツール"
    )
    parser.add_argument(
        "--exchange",
        default=EXCHANGE_DIVISION,
        choices=["ALL", "T", "TP", "TS", "TG"],
        help="市場フィルタ（スクリーニングモードのみ有効。--trade では settings.yaml の trade.exchange を使用する）",
    )
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--trade",   action="store_true", help="自動売買モードで起動")
    parser.add_argument("--monitor", action="store_true", help="リアルタイムモニターで起動（発注なし）")
    parser.add_argument("--dry-run", action="store_true", help="検証モード（発注なし）")
    args = parser.parse_args()

    if args.trade:
        run_trade(args)
    elif args.monitor:
        run_monitor(args)
    else:
        run_screener(args)


if __name__ == "__main__":
    main()
