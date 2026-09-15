"""
ランキングアルゴリズムの有効性検証スクリプト

daily_candidates から直近の候補銘柄を取得し、
yfinance の1分足データで実際の騰落率を計算して
スコア・ランキング数との相関を分析する。

使い方:
    python scripts/validate_ranking.py
    python scripts/validate_ranking.py --date 2026-07-03  # 特定日指定
"""
import argparse
import sqlite3
import sys
import time

import pandas as pd
import yfinance as yf

DB_PATH = r"C:\claude\auto-trade_ai\data\trades.db"


def fetch_intraday(symbol: str) -> dict | None:
    """1分足データから本日の騰落指標を計算する。"""
    try:
        df = yf.download(
            f"{symbol}.T", interval="1m", period="2d",
            progress=False, auto_adjust=True, multi_level_index=False,
        )
        if df is None or len(df) < 10:
            return None

        df.index = pd.to_datetime(df.index)

        # 指定日のデータに絞る（期日引数があれば）
        target_date = getattr(fetch_intraday, "_target_date", None)
        if target_date:
            df = df[df.index.date == pd.Timestamp(target_date).date()]
        if len(df) < 5:
            return None

        # 09:30以降（寄り付き確定後）に絞る
        df_session = df[df.index.time >= pd.Timestamp("09:30").time()]
        if len(df_session) < 5:
            df_session = df

        open_price  = float(df_session["Open"].iloc[0])
        close_price = float(df_session["Close"].iloc[-1])
        high_price  = float(df_session["High"].max())
        low_price   = float(df_session["Low"].min())

        return {
            "open":     open_price,
            "close":    close_price,
            "ret_pct":  round((close_price - open_price) / open_price * 100, 2),
            "max_gain": round((high_price  - open_price) / open_price * 100, 2),
            "max_loss": round((low_price   - open_price) / open_price * 100, 2),
            "bars":     len(df_session),
        }
    except Exception as e:
        return {"error": str(e)}


def avg(vals: list) -> float:
    return sum(vals) / len(vals) if vals else float("nan")


def group_stats(rows: list, label: str) -> None:
    rets = [r["ret_pct"] for r in rows if "ret_pct" in r]
    if not rets:
        print(f"\n  --- {label} (0銘柄) --- データなし")
        return
    wins = [r for r in rets if r > 0]
    print(f"\n  --- {label} ({len(rows)}銘柄) ---")
    print(f"    平均騰落率    : {avg(rets):+.2f}%")
    print(f"    中央値        : {sorted(rets)[len(rets)//2]:+.2f}%")
    print(f"    勝率(>0%)     : {len(wins)/len(rets)*100:.0f}%  ({len(wins)}/{len(rets)})")
    print(f"    最大          : {max(rets):+.2f}%")
    print(f"    最小          : {min(rets):+.2f}%")
    print(f"    平均最大含み益: {avg([r.get('max_gain',0) for r in rows if 'max_gain' in r]):+.2f}%")
    print(f"    平均最大含み損: {avg([r.get('max_loss',0) for r in rows if 'max_loss' in r]):+.2f}%")


def rank_count(reasons: str) -> int:
    """reasons 文字列から何種類のランキングに出現したか数える。"""
    if not reasons:
        return 0
    return reasons.count("位")


def main() -> None:
    parser = argparse.ArgumentParser(description="ランキングアルゴリズム有効性検証")
    parser.add_argument("--date", default=None, help="検証対象日 (YYYY-MM-DD)。省略時は最新データ")
    args = parser.parse_args()

    # ── 候補銘柄を DB から読み込む ───────────────────────────────────
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    if args.date:
        rows = conn.execute(
            "SELECT symbol, symbol_name, current_price, score, reasons "
            "FROM daily_candidates WHERE date=? ORDER BY score DESC",
            (args.date,),
        ).fetchall()
        date_label = args.date
    else:
        date_row = conn.execute(
            "SELECT date FROM daily_candidates ORDER BY fetched_at DESC LIMIT 1"
        ).fetchone()
        if not date_row:
            print("daily_candidates にデータがありません。先に --trade または --dry-run を実行してください。")
            sys.exit(1)
        date_label = date_row["date"]
        rows = conn.execute(
            "SELECT symbol, symbol_name, current_price, score, reasons "
            "FROM daily_candidates WHERE date=? ORDER BY score DESC",
            (date_label,),
        ).fetchall()
    conn.close()

    candidates = [dict(r) for r in rows]
    print(f"候補銘柄数: {len(candidates)}件  (日付: {date_label})")
    if not candidates:
        print(f"{date_label} のデータがありません。")
        sys.exit(1)

    # ── 各銘柄の騰落率を yfinance で取得 ────────────────────────────
    fetch_intraday._target_date = date_label  # type: ignore[attr-defined]

    print("\n騰落率を取得中...")
    results = []
    for i, c in enumerate(candidates):
        intra = fetch_intraday(c["symbol"])
        time.sleep(0.3)
        row = {**c, **(intra or {})}
        results.append(row)
        ret_str = f"{intra['ret_pct']:+.2f}%" if intra and "ret_pct" in intra else "取得失敗"
        print(f"  [{i+1:2d}] {c['symbol']} {str(c['symbol_name'] or ''):15s} score={c['score']:5.1f}  {ret_str}")

    # ── ベンチマーク（日経225 ETF: 1321）────────────────────────────
    print("\nベンチマーク取得中 (日経225 ETF 1321)...")
    bench = fetch_intraday("1321")
    bench_ret = bench["ret_pct"] if bench and "ret_pct" in bench else None
    if bench_ret is not None:
        print(f"  日経225 ETF: {bench_ret:+.2f}%")
    else:
        print("  日経225 ETF: 取得失敗")

    # ── 分析 ─────────────────────────────────────────────────────────
    valid = [r for r in results if "ret_pct" in r]

    print("\n" + "=" * 60)
    print("  ランキングアルゴリズム 有効性検証")
    print("=" * 60)

    if bench_ret is not None:
        print(f"\n  ベンチマーク (日経225 ETF):  {bench_ret:+.2f}%")

    high = [r for r in valid if r["score"] >= 60]
    mid  = [r for r in valid if 40 <= r["score"] < 60]
    low  = [r for r in valid if r["score"] < 40]

    group_stats(high, "高スコア (>=60)  <- エントリー対象")
    group_stats(mid,  "中スコア (40-59)")
    group_stats(low,  "低スコア (<40)")
    group_stats(valid, "全候補")

    for r in valid:
        r["rank_count"] = rank_count(r.get("reasons", ""))

    triple = [r for r in valid if r["rank_count"] == 3]
    double = [r for r in valid if r["rank_count"] == 2]
    single = [r for r in valid if r["rank_count"] == 1]

    print("\n  --- ランキング出現数別 ---")
    group_stats(triple, "3ランキング出現 (値上がり+売買高+売買代金)")
    group_stats(double, "2ランキング出現")
    group_stats(single, "1ランキング出現")

    # ── 全銘柄一覧（騰落率順）────────────────────────────────────────
    print(f"\n  --- 全候補 騰落率ランキング ---")
    for r in sorted(valid, key=lambda x: x.get("ret_pct", -999), reverse=True):
        rc   = r.get("rank_count", "?")
        ret  = r.get("ret_pct", float("nan"))
        mg   = r.get("max_gain", 0)
        ml   = r.get("max_loss", 0)
        beat = "^beat" if bench_ret is not None and ret > bench_ret else "     "
        print(
            f"    {r['symbol']} {str(r['symbol_name'] or ''):15s} "
            f"score={r['score']:5.1f} rank*{rc}  "
            f"ret={ret:+.2f}% (max_gain={mg:+.2f}% max_loss={ml:+.2f}%)  {beat}"
        )

    # ── スコア vs 騰落率 相関 ─────────────────────────────────────────
    if len(valid) >= 5:
        s = pd.Series([r["score"]   for r in valid])
        t = pd.Series([r["ret_pct"] for r in valid])
        corr = s.corr(t)
        print(f"\n  スコア vs 騰落率 相関係数: {corr:.3f}")
        if abs(corr) >= 0.3:
            direction = "正の" if corr > 0 else "負の"
            print(f"  -> {direction}相関あり（アルゴリズムに有効性の示唆）")
        else:
            print(f"  -> 明確な相関なし（|r|<0.3）")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
