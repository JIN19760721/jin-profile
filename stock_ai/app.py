"""
Streamlit GUI（Windows 上でブラウザから操作するための画面）。

既存の分析・監視ロジック（analyze.py / trade_decision.py / intraday_monitor.py /
backtest.py / daily_report.py / ranking_notifier.py / watchlist.py 等）は変更せず、
- 副作用を伴う重い処理（ランキング作成・5分足監視）は subprocess で main.py を呼ぶ
- 副作用のない処理（通知・watchlist登録・日次レポート・バックテスト・各種表示）は
  既存関数を直接 import して呼ぶ
ことで実現する。自動売買は一切実装しない（表示・通知・手動操作のみ）。

起動: run_gui.bat または `streamlit run app.py`
"""

import subprocess
import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import yaml

from config import DB_PATH, SETTINGS_PATH, get_market_status

BASE_DIR = Path(__file__).parent

st.set_page_config(page_title="stock_ai GUI", layout="wide")


# ── 共通ヘルパー ──────────────────────────────────────────────

def run_main(args: list[str]) -> subprocess.CompletedProcess:
    """既存 main.py を subprocess で呼び出す（既存ロジックは一切変更しない）"""
    cmd = [sys.executable, str(BASE_DIR / "main.py"), *args]
    return subprocess.run(cmd, cwd=str(BASE_DIR), capture_output=True, text=True, encoding="utf-8", errors="replace")


def show_process_result(result: subprocess.CompletedProcess):
    if result.returncode == 0:
        st.success("実行完了")
    else:
        st.error(f"終了コード: {result.returncode}")
    with st.expander("実行ログ", expanded=(result.returncode != 0)):
        st.text(result.stdout or "(stdout なし)")
        if result.stderr:
            st.text(result.stderr)


@st.cache_data(ttl=5)
def read_sql(query: str, params: tuple = ()) -> pd.DataFrame:
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    try:
        return pd.read_sql_query(query, conn, params=params)
    except Exception:
        return pd.DataFrame()
    finally:
        conn.close()


# BUY/WAIT/SELL は trade_decision.compute_final_action() が判定し、
# trade_signals.final_action に保存された値を表示するのみ（GUI側での再計算は行わない）。


def get_intraday_target_preview(manual_codes: list[str]) -> tuple[list[str], str]:
    """
    main.py の run_intraday_mode() と同じ優先順位（--codes > watchlist > ランキング上位5件）
    で監視対象を判定して返す（表示専用のプレビュー）。
    実際の「監視実行」ボタン押下時は main.py --intraday を subprocess で呼ぶだけで、
    対象選定は main.py 側が独自に行う。ここで使う判定関数（parse_codes /
    get_active_watchlist / get_top_ranked_codes / get_stopped_codes）は main.py と
    完全に同一のものを再利用しており、選定ロジックを重複実装していない。
    """
    from code_parser import parse_codes
    from db import get_stopped_codes
    from watchlist import get_active_watchlist, get_top_ranked_codes

    parsed = parse_codes(manual_codes)
    if parsed:
        codes, source = parsed, "--codes指定"
    else:
        watchlist_rows = get_active_watchlist()
        if watchlist_rows:
            codes, source = [w["code"] for w in watchlist_rows], "watchlist"
        else:
            ranked = get_top_ranked_codes(limit=5)
            if ranked:
                codes, source = ranked, "ranking fallback"
            else:
                codes, source = [], "対象なし"

    stopped = get_stopped_codes()
    codes = [c for c in codes if c not in stopped]
    return codes, source


# ── サイドバー ────────────────────────────────────────────────

st.sidebar.header("設定")

codes_input = st.sidebar.text_input(
    "監視銘柄コード（4桁・スペース区切り、最大5件）", value="", placeholder="例: 3237 7203 3778"
)
entry_mode = st.sidebar.selectbox("entry_mode", ["first_close", "manual"], index=0)
limit_ranking_notify = st.sidebar.checkbox(
    "ランキング通知の件数を指定する（チェックなしは抽出された全銘柄を通知）", value=False
)
ranking_top_n = st.sidebar.number_input(
    "ランキング通知件数（上記チェック時のみ有効、最大20）",
    min_value=1, max_value=20, value=10, step=1, disabled=not limit_ranking_notify,
)
notify_line_on_monitor = st.sidebar.checkbox("監視実行時にLINE通知する（--notify-line）", value=False)
skip_fetch = st.sidebar.checkbox("ランキング作成時にデータ取得をスキップ（--skip-fetch）", value=False)

st.sidebar.divider()
auto_refresh = st.sidebar.checkbox("自動更新ON", value=False)
refresh_interval = st.sidebar.number_input("更新間隔（秒）", min_value=5, max_value=600, value=60, step=5)

codes_list = [c for c in codes_input.split() if c]

if auto_refresh:
    st.sidebar.caption(f"{refresh_interval} 秒ごとに自動更新します")
    st.markdown(
        f"<meta http-equiv='refresh' content='{int(refresh_interval)}'>",
        unsafe_allow_html=True,
    )


# ── メイン画面: 操作ボタン ────────────────────────────────────

st.title("stock_ai 操作パネル")

_MARKET_STATUS_LABELS = {
    "CLOSED_DAY": ("warning", "本日は取引日ではありません（土日・祝日）。監視は自動実行されません。"),
    "WAITING": (
        "info",
        "監視待機中（取引時間前）。09:00になると自動的に5分足監視を開始します（line_webhook.py起動中の場合）。",
    ),
    "OPEN": (
        "success",
        "取引時間内です。5分おきに自動的に5分足監視が実行されます（line_webhook.py起動中の場合）。",
    ),
    "ENDED": ("info", "本日の取引時間は終了しました（15:30以降）。"),
}
_status_kind, _status_text = _MARKET_STATUS_LABELS[get_market_status()]
getattr(st, _status_kind)(_status_text)

preview_codes, preview_source = get_intraday_target_preview(codes_list)
st.subheader("監視対象（5分足監視実行の対象、main.pyと同じ優先順位で判定）")
if preview_codes:
    st.text("\n".join(f"{c} ({preview_source})" for c in preview_codes))
else:
    st.warning("監視対象がありません（--codes未指定・watchlist空・ランキングデータなし）。"
               "サイドバーに銘柄コードを入力するか、ランキングを作成してください。")

col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    if st.button("注目銘柄ランキング作成", use_container_width=True):
        args = []
        if skip_fetch:
            args.append("--skip-fetch")
        with st.spinner("ランキング作成中..."):
            result = run_main(args)
        show_process_result(result)
        st.cache_data.clear()

with col2:
    if st.button("ランキングをLINE通知", use_container_width=True):
        from ranking_notifier import notify_ranking
        top_n = int(ranking_top_n) if limit_ranking_notify else None
        with st.spinner("LINE通知中..."):
            ok = notify_ranking(top_n)
        if ok:
            st.success("LINE通知を送信しました")
        else:
            st.error("LINE通知に失敗しました（データ無し、またはLINE設定未完了）")

with col3:
    if st.button("監視実行（5分足）", use_container_width=True):
        args = ["--intraday"]
        if codes_list:
            args += ["--codes", *codes_list]
        args += ["--entry-mode", entry_mode]
        if notify_line_on_monitor:
            args.append("--notify-line")
        with st.spinner("5分足監視実行中..."):
            result = run_main(args)
        show_process_result(result)
        st.cache_data.clear()

with col4:
    if st.button("日次レポート作成", use_container_width=True):
        with st.spinner("日次レポート作成中..."):
            result = run_main(["--daily-report"])
        show_process_result(result)
        st.cache_data.clear()

with col5:
    if st.button("バックテスト実行", use_container_width=True):
        args = ["--backtest"]
        if codes_list:
            args += ["--codes", *codes_list]
        with st.spinner("バックテスト実行中..."):
            result = run_main(args)
        show_process_result(result)
        st.cache_data.clear()

st.divider()

col_w1, col_w2 = st.columns(2)
with col_w1:
    if st.button("入力した銘柄を watchlist に登録"):
        from code_parser import parse_codes
        parsed = parse_codes(codes_list)
        if not parsed:
            st.error("サイドバーに有効な4桁銘柄コードを入力してください。")
        else:
            from watchlist import register_watchlist
            rows = register_watchlist(parsed, source="GUI")
            st.success(f"watchlist 登録完了: {[r['code'] for r in rows]}")
            st.cache_data.clear()


# ── 表示タブ ──────────────────────────────────────────────────

tabs = st.tabs([
    "ランキング", "watchlist", "5分足データ", "デイトレ判定",
    "BUY/WAIT/SELL", "日次レポート", "ランキング検証", "settings.yaml",
])

# --- ランキング ---
with tabs[0]:
    from ranking_notifier import get_latest_ranking
    df_rank = get_latest_ranking()
    if df_rank.empty:
        st.info("ランキングデータがありません。「注目銘柄ランキング作成」を実行してください。")
    else:
        st.caption(f"対象日: {df_rank.attrs.get('date', '')}")
        df_rank_display = df_rank.rename(columns={
            "stop_high_pick":          "ストップ高翌日継続候補",
            "technical_score":         "テクニカル点",
            "volume_flow_score":       "出来高点",
            "baseline_score":          "ベースライン点(検証済み)",
            "earnings_momentum_score": "決算モメンタム点",
            "fundamental_score":       "ファンダメンタル点",
            "consecutive_up_days":     "連続上昇日数",
            "risk_penalty_score":      "過熱・連続上昇ペナルティ",
            "market_sentiment":        "地合い",
            "market_sentiment_score":  "地合いスコア",
            "total_score":             "合計点",
        })
        st.dataframe(df_rank_display, use_container_width=True, hide_index=True)

# --- watchlist ---
with tabs[1]:
    from watchlist import get_active_watchlist
    watch_rows = get_active_watchlist()[:5]  # watchlist は最大5件（db.get_active_watchlist側でも制限済み）
    if not watch_rows:
        st.info("監視中の銘柄がありません。")
    else:
        st.dataframe(pd.DataFrame(watch_rows), use_container_width=True, hide_index=True)

# --- 5分足データ + チャート ---
with tabs[2]:
    df_codes = read_sql("SELECT DISTINCT code FROM intraday_prices ORDER BY code")
    available_codes = df_codes["code"].tolist() if not df_codes.empty else []
    if not available_codes:
        st.info("5分足データがありません。「監視実行（5分足）」を実行してください。")
    else:
        selected_code = st.selectbox("表示銘柄", available_codes)
        df_intraday = read_sql(
            "SELECT * FROM intraday_prices WHERE code = ? ORDER BY datetime",
            (selected_code,),
        )
        df_signals_for_chart = read_sql(
            "SELECT * FROM trade_signals WHERE code = ? ORDER BY signal_datetime",
            (selected_code,),
        )
        st.dataframe(df_intraday, use_container_width=True, hide_index=True)

        if not df_intraday.empty:
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=df_intraday["datetime"], y=df_intraday["close"],
                mode="lines+markers", name="終値",
            ))
            if not df_signals_for_chart.empty:
                if "vwap" in df_signals_for_chart.columns:
                    fig.add_trace(go.Scatter(
                        x=df_signals_for_chart["signal_datetime"], y=df_signals_for_chart["vwap"],
                        mode="lines", name="VWAP", line=dict(dash="dot"),
                    ))
                entry_price = df_signals_for_chart["entry_price"].dropna()
                if not entry_price.empty:
                    fig.add_hline(y=float(entry_price.iloc[0]), line_dash="dash",
                                  annotation_text="entry_price", line_color="green")
                atr_stop = df_signals_for_chart["atr_stop_price"].dropna()
                if not atr_stop.empty:
                    fig.add_hline(y=float(atr_stop.iloc[-1]), line_dash="dash",
                                  annotation_text="atr_stop_price", line_color="red")
            fig.update_layout(title=f"{selected_code} 5分足終値 / VWAP", height=450)
            st.plotly_chart(fig, use_container_width=True)

# --- デイトレ判定 (signal / entry_score) ---
with tabs[3]:
    df_signals = read_sql("SELECT * FROM trade_signals ORDER BY signal_datetime DESC LIMIT 200")
    if df_signals.empty:
        st.info("デイトレ判定データがありません。")
    else:
        display_cols = [c for c in [
            "code", "signal_datetime", "current_price", "entry_price", "profit_pct",
            "signal", "signal_strength", "entry_score", "entry_candidate",
            "final_action", "final_action_score", "reason", "risk_level",
        ] if c in df_signals.columns]
        st.dataframe(df_signals[display_cols], use_container_width=True, hide_index=True)

# --- BUY/WAIT/SELL ---
with tabs[4]:
    df_latest_signals = read_sql("""
        SELECT t.* FROM trade_signals t
        INNER JOIN (
            SELECT code, MAX(signal_datetime) AS max_dt FROM trade_signals GROUP BY code
        ) m ON t.code = m.code AND t.signal_datetime = m.max_dt
    """)
    if df_latest_signals.empty:
        st.info("判定データがありません。")
    else:
        display_cols = [c for c in [
            "code", "signal_datetime", "signal", "entry_candidate", "entry_score",
            "final_action", "final_action_score", "final_action_reason",
            "current_price", "profit_pct",
        ] if c in df_latest_signals.columns]
        st.dataframe(df_latest_signals[display_cols], use_container_width=True, hide_index=True)

    st.caption("売買判断（BUY/WAIT/SELL）の変化履歴（最新50件）")
    df_final_action_history = read_sql(
        "SELECT * FROM final_action_history ORDER BY signal_datetime DESC LIMIT 50"
    )
    if df_final_action_history.empty:
        st.info("売買判断の変化履歴がありません。")
    else:
        st.dataframe(df_final_action_history, use_container_width=True, hide_index=True)

# --- 日次レポート ---
with tabs[5]:
    from datetime import date as _date
    report_date = st.date_input("対象日", value=_date.today())
    if st.button("この日付で日次レポートを表示"):
        from daily_report import build_daily_report
        df_report = build_daily_report(str(report_date))
        if df_report.empty:
            st.info(f"{report_date} のデータがありません。")
        else:
            st.dataframe(df_report, use_container_width=True, hide_index=True)

# --- ランキング検証 ---
with tabs[6]:
    from datetime import date as _date2
    st.caption("対象日の注目銘柄ランキングが、翌営業日にどう値動きしたかを検証します。")
    validation_date = st.date_input("検証対象日（ランキング作成日）", value=_date2.today(), key="validation_date")
    if st.button("この日付でランキング検証を実行"):
        from ranking_validation import validate_ranking
        with st.spinner("検証中..."):
            df_validation = validate_ranking(str(validation_date))
        if df_validation.empty:
            st.info(f"{validation_date} のランキングデータ、または翌営業日の株価データがありません。")
        else:
            counts = df_validation["validation_result"].value_counts()
            labels = ["HIT", "GOOD", "OK", "NEUTRAL", "BAD"]
            st.write(" / ".join(f"{label}: {counts.get(label, 0)}件" for label in labels))
            df_validation_display = df_validation.rename(columns={
                "rank":              "順位",
                "code":              "銘柄コード",
                "company_name":      "銘柄名",
                "total_score":       "総合スコア",
                "entry_price":       "エントリー価格",
                "entry_price_source": "エントリー価格の種類",
                "next_open":         "翌日始値",
                "next_high":         "翌日高値",
                "next_low":          "翌日安値",
                "next_close":        "翌日終値",
                "max_gain_pct":      "最大上昇率(%)",
                "max_drawdown_pct":  "最大下落率(%)",
                "close_return_pct":  "終値リターン(%)",
                "validation_result": "検証結果",
            })
            st.dataframe(df_validation_display, use_container_width=True, hide_index=True)

    st.divider()
    st.caption("保存済みの全日付分のランキングをまとめて検証し、スコア要素ごとの有効性（翌日リターンとの相関）を確認します。")
    if st.button("全期間まとめて検証"):
        from ranking_validation import correlation_summary, summarize_by_score_band, validate_ranking_range
        with st.spinner("複数日検証中..."):
            df_all = validate_ranking_range()
        if df_all.empty:
            st.info("検証可能なランキングデータがありません。")
        else:
            st.write(f"対象: {df_all['ranking_date'].nunique()}日分 / {len(df_all)}銘柄")
            counts = df_all["validation_result"].value_counts()
            labels = ["HIT", "GOOD", "OK", "NEUTRAL", "BAD"]
            st.write(" / ".join(f"{label}: {counts.get(label, 0)}件" for label in labels))

            st.write("**スコア要素と翌日リターンの相関係数**（プラスほど「高スコア→翌日上昇」との結びつきが強い）")
            corr = correlation_summary(df_all)
            st.dataframe(corr.rename("相関係数").reset_index().rename(columns={"index": "スコア要素"}),
                         use_container_width=True, hide_index=True)

            score_col = st.selectbox(
                "スコア帯別の的中率を確認する要素",
                ["baseline_score", "earnings_momentum_score", "technical_score", "volume_flow_score",
                 "fundamental_score", "risk_penalty_score", "market_sentiment_score"],
            )
            band_df = summarize_by_score_band(df_all, score_col)
            if not band_df.empty:
                st.dataframe(band_df, use_container_width=True, hide_index=True)

# --- settings.yaml ---
with tabs[7]:
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            settings_dict = yaml.safe_load(f) or {}
        st.json(settings_dict)
    else:
        st.info("settings.yaml が見つかりません（config.py のデフォルト値が使われます）。")
