"""
注目銘柄ランキングの LINE 通知。

get_latest_ranking(top_n=None) → analysis_results の最新分析日のランキングを DataFrame で返す
                                  （top_n 省略時は抽出された全銘柄、指定時は上位 top_n 件）。
build_ranking_message(df)      → LINE 通知文を構築する。
notify_ranking(top_n=None)     → ランキングを取得して LINE へ送信する（デフォルトで全銘柄）。
"""

import logging
import sqlite3

import pandas as pd

from config import DB_PATH

logger = logging.getLogger(__name__)

_MAX_TOP_N = 20


def _format_code(code) -> str:
    """5桁コード（末尾0）を4桁表示に変換する"""
    s = str(code)
    if len(s) == 5 and s.endswith("0"):
        return s[:-1]
    return s


def get_latest_ranking(top_n: int | None = None) -> pd.DataFrame:
    """
    analysis_results の最新分析日のランキングを返す。
    top_n が None（省略時）は抽出された全銘柄、指定時は上位 top_n 件
    （最大 _MAX_TOP_N 件に制限）を返す。
    データがない場合は空 DataFrame を返す。
    """
    if top_n is not None:
        top_n = min(top_n, _MAX_TOP_N)

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.execute("SELECT MAX(date) FROM analysis_results")
        row = cursor.fetchone()
        latest_date = row[0] if row and row[0] else None
        if not latest_date:
            conn.close()
            logger.warning("analysis_results にデータがありません")
            return pd.DataFrame()

        query = """
            SELECT rank, code, company_name, close, change_pct,
                   volume_ratio_5d, trading_value, stop_high_pick,
                   technical_score, volume_flow_score, baseline_score, earnings_momentum_score,
                   fundamental_score, consecutive_up_days, risk_penalty_score,
                   market_sentiment, market_sentiment_score, total_score, reason
            FROM analysis_results
            WHERE date = ?
            ORDER BY rank ASC
        """
        params: list = [latest_date]
        if top_n is not None:
            query += " LIMIT ?"
            params.append(top_n)

        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        df.attrs["date"] = latest_date
        logger.info("ランキング取得: 対象日=%s, %d 件", latest_date, len(df))
        return df
    except Exception as e:
        logger.error("ランキング取得エラー: %s", e)
        return pd.DataFrame()


def build_ranking_message(df: pd.DataFrame) -> str:
    """
    ランキング DataFrame から LINE 通知文を構築して返す。
    """
    analysis_date = df.attrs.get("date", "")
    parts = [f"【本日の注目銘柄ランキング】\n{analysis_date}"]

    for _, row in df.iterrows():
        rank = int(row["rank"]) if pd.notna(row.get("rank")) else "?"
        code = _format_code(row["code"])
        company_name = row.get("company_name") or ""

        close = row.get("close")
        change_pct = row.get("change_pct")
        volume_ratio_5d = row.get("volume_ratio_5d")
        total_score = row.get("total_score")
        reason = row.get("reason") or ""

        close_str = f"{close:,.0f}円" if pd.notna(close) and close is not None else "---"
        change_str = f"{change_pct:+.1f}%" if pd.notna(change_pct) and change_pct is not None else "---"
        volume_str = f"{volume_ratio_5d:.1f}倍" if pd.notna(volume_ratio_5d) and volume_ratio_5d is not None else "---"
        score_str = str(int(total_score)) if pd.notna(total_score) and total_score is not None else "---"

        block = (
            f"{rank}位 {code} {company_name}\n"
            f"株価：{close_str}\n"
            f"前日比：{change_str}\n"
            f"出来高急増：{volume_str}\n"
            f"スコア：{score_str}\n"
            f"理由：{reason}"
        )
        parts.append(block)

    return "\n\n".join(parts)


def notify_ranking(top_n: int | None = None) -> bool:
    """
    最新ランキングを取得して LINE へ送信する。
    top_n 省略時は抽出された全銘柄を通知する。
    送信失敗時も例外は raise せず False を返す。
    """
    from line_notify import send_line_message

    df = get_latest_ranking(top_n)
    if df.empty:
        logger.warning("通知対象のランキングデータがありません")
        return False

    message = build_ranking_message(df)
    return send_line_message(message)
