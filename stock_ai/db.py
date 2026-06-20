import sqlite3
import logging
from contextlib import contextmanager
from config import DB_PATH

logger = logging.getLogger(__name__)

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS listed_companies (
    code          TEXT PRIMARY KEY,
    company_name  TEXT,
    market_type   TEXT,
    sector17_code TEXT,
    sector33_code TEXT,
    size_code     TEXT,
    updated_date  TEXT
);

CREATE TABLE IF NOT EXISTS daily_quotes (
    date               TEXT NOT NULL,
    code               TEXT NOT NULL,
    open               REAL,
    high               REAL,
    low                REAL,
    close              REAL,
    upper_limit        REAL,
    lower_limit        REAL,
    volume             REAL,
    turnover_value     REAL,
    adjustment_factor  REAL,
    adjustment_open    REAL,
    adjustment_high    REAL,
    adjustment_low     REAL,
    adjustment_close   REAL,
    adjustment_volume  REAL,
    PRIMARY KEY (date, code)
);

CREATE TABLE IF NOT EXISTS market_indices (
    symbol TEXT NOT NULL,
    date   TEXT NOT NULL,
    open   REAL,
    high   REAL,
    low    REAL,
    close  REAL,
    volume REAL,
    PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS earnings_data (
    code                          TEXT NOT NULL,
    fiscal_period                 TEXT NOT NULL,
    sales_growth_pct              REAL,
    operating_profit_growth_pct   REAL,
    ordinary_profit_growth_pct    REAL,
    net_income_growth_pct         REAL,
    eps_growth_pct                REAL,
    progress_rate_pct             REAL,
    upward_revision_flag          INTEGER,
    created_at                    TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, fiscal_period)
);

CREATE TABLE IF NOT EXISTS fundamentals (
    code              TEXT PRIMARY KEY,
    market_cap        REAL,
    per               REAL,
    pbr               REAL,
    roe               REAL,
    equity_ratio      REAL,
    operating_margin  REAL,
    sales             REAL,
    operating_profit  REAL,
    eps               REAL,
    dividend_yield    REAL,
    created_at        TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS intraday_prices (
    code       TEXT NOT NULL,
    datetime   TEXT NOT NULL,
    open       REAL,
    high       REAL,
    low        REAL,
    close      REAL,
    volume     REAL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, datetime)
);

CREATE TABLE IF NOT EXISTS intraday_positions (
    code          TEXT NOT NULL,
    entry_price   REAL,
    current_price REAL,
    profit_pct    REAL,
    entry_mode    TEXT,
    calculated_at TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, calculated_at)
);

CREATE TABLE IF NOT EXISTS trade_signals (
    code                  TEXT NOT NULL,
    signal_datetime       TEXT NOT NULL,
    current_price         REAL,
    entry_price           REAL,
    profit_pct            REAL,
    signal                TEXT,
    reason                TEXT,
    vwap                  REAL,
    volume_ma3            REAL,
    volume_ma6            REAL,
    volume_decline_flag   INTEGER,
    bar_change_pct        REAL,
    abnormal_volume_flag  INTEGER,
    confirmation_count    INTEGER,
    signal_strength       TEXT,
    previous_high         REAL,
    previous_low          REAL,
    previous_close        REAL,
    breakout_prev_high_flag  INTEGER,
    breakdown_prev_low_flag  INTEGER,
    opening_30min_high       REAL,
    opening_30min_low        REAL,
    opening_range_breakout   INTEGER,
    opening_range_breakdown  INTEGER,
    volume_ma12              REAL,
    volume_ratio_3_12        REAL,
    volume_surge_continuation INTEGER,
    volume_fading            INTEGER,
    atr_14                   REAL,
    atr_stop_price           REAL,
    atr_stop_loss_flag       INTEGER,
    signal_score             INTEGER,
    positive_factors         TEXT,
    negative_factors         TEXT,
    risk_level               TEXT,
    signal_changed           INTEGER,  -- 非推奨: LINE通知判定は signal_history.changed_flag を使用
    market_sentiment         TEXT,
    market_change_pct        REAL,
    entry_score              INTEGER,
    entry_candidate          TEXT,
    entry_factors             TEXT,
    created_at            TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, signal_datetime)
);

CREATE TABLE IF NOT EXISTS signal_history (
    code            TEXT NOT NULL,
    signal_datetime TEXT NOT NULL,
    previous_signal TEXT,
    current_signal  TEXT,
    changed_flag    INTEGER,
    reason          TEXT,
    created_at      TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, signal_datetime)
);

CREATE TABLE IF NOT EXISTS entry_candidate_history (
    code                      TEXT NOT NULL,
    signal_datetime           TEXT NOT NULL,
    previous_entry_candidate  TEXT,
    current_entry_candidate   TEXT,
    changed_flag              INTEGER,
    entry_score               INTEGER,
    entry_factors             TEXT,
    reason                    TEXT,
    created_at                TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, signal_datetime)
);

CREATE TABLE IF NOT EXISTS final_action_history (
    code                     TEXT NOT NULL,
    signal_datetime          TEXT NOT NULL,
    previous_final_action    TEXT,
    current_final_action     TEXT,
    changed_flag             INTEGER,
    final_action_score       INTEGER,
    reason                   TEXT,
    created_at               TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, signal_datetime)
);

CREATE TABLE IF NOT EXISTS monitoring_status (
    code        TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    stop_reason TEXT,
    stopped_at  TEXT,
    resumed_at  TEXT,
    created_at  TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS analysis_results (
    code              TEXT NOT NULL,
    date              TEXT NOT NULL,
    company_name      TEXT,
    close             REAL,
    price_change_pct  REAL,
    volume_ratio      REAL,
    turnover_value    REAL,
    ma5               REAL,
    ma5_diff_pct      REAL,
    trend_5d          INTEGER,
    score             REAL,
    rank              INTEGER,
    created_at        TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (code, date)
);

CREATE TABLE IF NOT EXISTS watchlist (
    code          TEXT PRIMARY KEY,
    company_name  TEXT,
    selected_date TEXT,
    source        TEXT,
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at    TEXT DEFAULT (datetime('now', 'localtime'))
);
"""

# analysis_results に追加するカラム
_ANALYSIS_NEW_COLS = [
    ("technical_score",          "REAL"),
    ("volume_flow_score",        "REAL"),
    ("earnings_momentum_score",  "REAL"),
    ("fundamental_score",        "REAL"),
    ("total_score",              "REAL"),
    ("change_pct",               "REAL"),
    ("volume_ratio_5d",          "REAL"),
    ("trading_value",            "REAL"),
    ("trading_value_ratio_5d",   "REAL"),
    ("volume_ma5",               "REAL"),
    ("trading_value_ma5",        "REAL"),
    ("ma25",                     "REAL"),
    ("ma5_gap_pct",              "REAL"),
    ("ma25_gap_pct",             "REAL"),
    ("high_20d",                 "REAL"),
    ("high_breakout",            "INTEGER"),
    ("earnings_data_status",     "TEXT"),
    ("fundamental_data_status",  "TEXT"),
    ("reason",                   "TEXT"),
]

# trade_signals に追加するカラム
_TRADE_SIGNALS_NEW_COLS = [
    ("bar_change_pct",          "REAL"),
    ("abnormal_volume_flag",    "INTEGER"),
    ("confirmation_count",      "INTEGER"),
    ("signal_strength",         "TEXT"),
    ("previous_high",           "REAL"),
    ("previous_low",            "REAL"),
    ("previous_close",          "REAL"),
    ("breakout_prev_high_flag", "INTEGER"),
    ("breakdown_prev_low_flag", "INTEGER"),
    ("opening_30min_high",      "REAL"),
    ("opening_30min_low",       "REAL"),
    ("opening_range_breakout",  "INTEGER"),
    ("opening_range_breakdown", "INTEGER"),
    ("volume_ma12",             "REAL"),
    ("volume_ratio_3_12",       "REAL"),
    ("volume_surge_continuation", "INTEGER"),
    ("volume_fading",           "INTEGER"),
    ("atr_14",                  "REAL"),
    ("atr_stop_price",          "REAL"),
    ("atr_stop_loss_flag",      "INTEGER"),
    ("signal_score",            "INTEGER"),
    ("positive_factors",        "TEXT"),
    ("negative_factors",        "TEXT"),
    ("risk_level",              "TEXT"),
    ("signal_changed",          "INTEGER"),
    ("market_sentiment",        "TEXT"),
    ("market_change_pct",       "REAL"),
    ("entry_score",             "INTEGER"),
    ("entry_candidate",         "TEXT"),
    ("entry_factors",           "TEXT"),
    ("final_action",            "TEXT"),
    ("final_action_score",      "INTEGER"),
    ("final_action_reason",     "TEXT"),
]

# monitoring_status に追加するカラム
_MONITORING_STATUS_NEW_COLS = [
    ("resumed_at", "TEXT"),
]


@contextmanager
def get_conn():
    # main.py / intraday_monitor.py / line_webhook.py が同じDBファイルへ
    # 別プロセスから同時に書き込むため、WALモード化とリトライ用のbusy_timeoutを設定する。
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _add_column_if_missing(conn, table: str, col: str, typ: str) -> None:
    """指定カラムが存在しなければ追加する。「カラム既存」以外のエラーは握り潰さず再送出する"""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    except sqlite3.OperationalError as e:
        if "duplicate column name" not in str(e).lower():
            raise


def _migrate_analysis_results(conn) -> None:
    """analysis_results テーブルに不足カラムを安全に追加する"""
    for col, typ in _ANALYSIS_NEW_COLS:
        _add_column_if_missing(conn, "analysis_results", col, typ)


def _migrate_trade_signals(conn) -> None:
    """trade_signals テーブルに不足カラムを安全に追加する"""
    for col, typ in _TRADE_SIGNALS_NEW_COLS:
        _add_column_if_missing(conn, "trade_signals", col, typ)


def _migrate_monitoring_status(conn) -> None:
    """monitoring_status テーブルに不足カラムを安全に追加する"""
    for col, typ in _MONITORING_STATUS_NEW_COLS:
        _add_column_if_missing(conn, "monitoring_status", col, typ)


def init_db():
    with get_conn() as conn:
        conn.executescript(CREATE_TABLES_SQL)
        _migrate_analysis_results(conn)
        _migrate_trade_signals(conn)
        _migrate_monitoring_status(conn)
    logger.info("DB初期化完了: %s", DB_PATH)


def upsert_companies(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO listed_companies
        (code, company_name, market_type, sector17_code, sector33_code, size_code, updated_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["company_name"], r["market_type"],
         r["sector17_code"], r["sector33_code"], r["size_code"], r["updated_date"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("上場銘柄保存: %d 件", len(data))


def upsert_daily_quotes(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO daily_quotes
        (date, code, open, high, low, close, upper_limit, lower_limit,
         volume, turnover_value, adjustment_factor,
         adjustment_open, adjustment_high, adjustment_low,
         adjustment_close, adjustment_volume)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """
    data = [
        (r.get("Date"), r.get("Code"),
         r.get("Open"), r.get("High"), r.get("Low"), r.get("Close"),
         r.get("UpperLimit"), r.get("LowerLimit"),
         r.get("Volume"), r.get("TurnoverValue"),
         r.get("AdjustmentFactor"),
         r.get("AdjustmentOpen"), r.get("AdjustmentHigh"),
         r.get("AdjustmentLow"), r.get("AdjustmentClose"),
         r.get("AdjustmentVolume"))
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("日次株価保存: %d 件", len(data))


def upsert_market_indices(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO market_indices
        (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    data = [(r["symbol"], r["date"], r["open"], r["high"],
             r["low"], r["close"], r["volume"]) for r in rows]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("市場指数保存: %d 件", len(data))


def upsert_analysis_results(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO analysis_results
        (code, date, company_name, close,
         price_change_pct, volume_ratio, turnover_value, ma5, ma5_diff_pct, trend_5d,
         score, rank,
         technical_score, volume_flow_score, earnings_momentum_score, fundamental_score,
         total_score, change_pct, volume_ratio_5d, trading_value, trading_value_ratio_5d,
         volume_ma5, trading_value_ma5,
         ma25, ma5_gap_pct, ma25_gap_pct, high_20d, high_breakout,
         earnings_data_status, fundamental_data_status, reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """
    data = [
        (r["code"], r["date"], r.get("company_name"), r.get("close"),
         r.get("change_pct"), r.get("volume_ratio_5d"), r.get("trading_value"),
         r.get("ma5"), r.get("ma5_gap_pct"), r.get("trend_5d", 0),
         r.get("total_score", 0), r.get("rank", 0),
         r.get("technical_score"), r.get("volume_flow_score"),
         r.get("earnings_momentum_score"), r.get("fundamental_score"),
         r.get("total_score"), r.get("change_pct"), r.get("volume_ratio_5d"),
         r.get("trading_value"), r.get("trading_value_ratio_5d"),
         r.get("volume_ma5"), r.get("trading_value_ma5"),
         r.get("ma25"), r.get("ma5_gap_pct"), r.get("ma25_gap_pct"),
         r.get("high_20d"), r.get("high_breakout"),
         r.get("earnings_data_status"), r.get("fundamental_data_status"),
         r.get("reason"))
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("分析結果保存: %d 件", len(data))


def upsert_intraday_prices(code: str, rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO intraday_prices
        (code, datetime, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    data = [
        (code, r["datetime"], r.get("open"), r.get("high"),
         r.get("low"), r.get("close"), r.get("volume"))
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("5分足保存: 銘柄 %s %d 件", code, len(data))


def upsert_intraday_positions(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO intraday_positions
        (code, entry_price, current_price, profit_pct, entry_mode, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["entry_price"], r["current_price"],
         r["profit_pct"], r["entry_mode"], r["calculated_at"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("損益計算結果保存: %d 件", len(data))


def upsert_trade_signals(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO trade_signals
        (code, signal_datetime, current_price, entry_price, profit_pct,
         signal, reason, vwap, volume_ma3, volume_ma6, volume_decline_flag,
         bar_change_pct, abnormal_volume_flag, confirmation_count, signal_strength,
         previous_high, previous_low, previous_close,
         breakout_prev_high_flag, breakdown_prev_low_flag,
         opening_30min_high, opening_30min_low,
         opening_range_breakout, opening_range_breakdown,
         volume_ma12, volume_ratio_3_12, volume_surge_continuation, volume_fading,
         atr_14, atr_stop_price, atr_stop_loss_flag,
         signal_score, positive_factors, negative_factors, risk_level, signal_changed,
         market_sentiment, market_change_pct, entry_score, entry_candidate, entry_factors,
         final_action, final_action_score, final_action_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["signal_datetime"], r["current_price"], r["entry_price"],
         r["profit_pct"], r["signal"], r["reason"], r["vwap"],
         r["volume_ma3"], r["volume_ma6"], r["volume_decline_flag"],
         r["bar_change_pct"], r["abnormal_volume_flag"], r["confirmation_count"], r["signal_strength"],
         r["previous_high"], r["previous_low"], r["previous_close"],
         r["breakout_prev_high_flag"], r["breakdown_prev_low_flag"],
         r["opening_30min_high"], r["opening_30min_low"],
         r["opening_range_breakout"], r["opening_range_breakdown"],
         r["volume_ma12"], r["volume_ratio_3_12"], r["volume_surge_continuation"], r["volume_fading"],
         r["atr_14"], r["atr_stop_price"], r["atr_stop_loss_flag"],
         r["signal_score"], r["positive_factors"], r["negative_factors"], r["risk_level"],
         r["signal_changed"], r["market_sentiment"], r["market_change_pct"],
         r["entry_score"], r["entry_candidate"], r["entry_factors"],
         r["final_action"], r["final_action_score"], r["final_action_reason"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("デイトレ判定結果保存: %d 件", len(data))


def upsert_signal_history(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO signal_history
        (code, signal_datetime, previous_signal, current_signal, changed_flag, reason)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["signal_datetime"], r["previous_signal"],
         r["current_signal"], r["changed_flag"], r["reason"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("シグナル変化履歴保存: %d 件", len(data))


def upsert_entry_candidate_history(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO entry_candidate_history
        (code, signal_datetime, previous_entry_candidate, current_entry_candidate,
         changed_flag, entry_score, entry_factors, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["signal_datetime"], r["previous_entry_candidate"], r["current_entry_candidate"],
         r["changed_flag"], r["entry_score"], r["entry_factors"], r["reason"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("買い候補変化履歴保存: %d 件", len(data))


def get_latest_entry_candidate(code: str) -> dict | None:
    """指定銘柄の直前の買い候補判定（entry_candidate_history）を1件返す。なければ None"""
    with get_conn() as conn:
        cursor = conn.execute(
            "SELECT * FROM entry_candidate_history WHERE code = ? ORDER BY signal_datetime DESC LIMIT 1",
            (code,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def upsert_final_action_history(rows: list[dict]):
    sql = """
        INSERT OR REPLACE INTO final_action_history
        (code, signal_datetime, previous_final_action, current_final_action,
         changed_flag, final_action_score, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    data = [
        (r["code"], r["signal_datetime"], r["previous_final_action"], r["current_final_action"],
         r["changed_flag"], r["final_action_score"], r["reason"])
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("売買判断変化履歴保存: %d 件", len(data))


def get_latest_final_action(code: str) -> dict | None:
    """指定銘柄の直前の売買判断（final_action_history）を1件返す。なければ None"""
    with get_conn() as conn:
        cursor = conn.execute(
            "SELECT * FROM final_action_history WHERE code = ? ORDER BY signal_datetime DESC LIMIT 1",
            (code,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_company_name(code: str) -> str | None:
    """
    指定銘柄の会社名を listed_companies から取得する。
    4桁コードもその5桁表記（末尾0）もあわせて検索する。データがなければ None。
    """
    code_5digit = f"{code}0" if len(code) == 4 else code
    with get_conn() as conn:
        cursor = conn.execute(
            "SELECT company_name FROM listed_companies WHERE code IN (?, ?) LIMIT 1",
            (code, code_5digit),
        )
        row = cursor.fetchone()
        return row["company_name"] if row else None


def get_stopped_codes() -> set[str]:
    """監視終了済み（STOPPED）の銘柄コード集合を返す。次回以降の --intraday 対象から除外するために使う"""
    with get_conn() as conn:
        cursor = conn.execute("SELECT code FROM monitoring_status WHERE status = 'STOPPED'")
        return {row["code"] for row in cursor.fetchall()}


def stop_monitoring(code: str, reason: str, stopped_at: str):
    """指定銘柄の監視を終了状態にする（以後 get_stopped_codes() に含まれるようになる）"""
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO monitoring_status (code, status, stop_reason, stopped_at, updated_at)
            VALUES (?, 'STOPPED', ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(code) DO UPDATE SET
                status = 'STOPPED',
                stop_reason = excluded.stop_reason,
                stopped_at = excluded.stopped_at,
                updated_at = datetime('now', 'localtime')
            """,
            (code, reason, stopped_at),
        )
    logger.info("銘柄 %s: 監視終了 (理由: %s)", code, reason)


def resume_monitoring(code: str, resumed_at: str):
    """
    指定銘柄の監視を再開する。status を RESUMED に変更し、
    stop_reason / stopped_at は NULL にクリア、resumed_at を記録する。
    以後 get_stopped_codes() には含まれなくなる（再び監視対象になる）。
    """
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO monitoring_status (code, status, stop_reason, stopped_at, resumed_at, updated_at)
            VALUES (?, 'RESUMED', NULL, NULL, ?, datetime('now', 'localtime'))
            ON CONFLICT(code) DO UPDATE SET
                status = 'RESUMED',
                stop_reason = NULL,
                stopped_at = NULL,
                resumed_at = excluded.resumed_at,
                updated_at = datetime('now', 'localtime')
            """,
            (code, resumed_at),
        )
    logger.info("銘柄 %s: 監視再開", code)


def get_latest_trade_signal(code: str) -> dict | None:
    """指定銘柄の直前の判定結果を1件返す（2本連続確認用）。なければ None"""
    with get_conn() as conn:
        cursor = conn.execute(
            "SELECT * FROM trade_signals WHERE code = ? ORDER BY signal_datetime DESC LIMIT 1",
            (code,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_latest_rank(code: str) -> int | None:
    """
    指定銘柄の最新の注目銘柄ランキング順位（analysis_results.rank）を返す。
    analysis_results は J-Quants の5桁コード（末尾0）で保存されているため、
    4桁コードもその5桁表記もあわせて検索する。日次フロー未実行・ランク外の
    場合はデータがないため None。
    """
    code_5digit = f"{code}0" if len(code) == 4 else code
    with get_conn() as conn:
        cursor = conn.execute(
            """
            SELECT rank FROM analysis_results
            WHERE code IN (?, ?)
            ORDER BY date DESC LIMIT 1
            """,
            (code, code_5digit),
        )
        row = cursor.fetchone()
        return row["rank"] if row and row["rank"] is not None else None


def get_recent_changed_signal(code: str, signal: str, since: str, before: str) -> dict | None:
    """
    指定銘柄・シグナルについて、[since, before) の範囲内で
    changed_flag=1（変化イベント）だった直近の signal_history 行を返す。
    LINE通知の30分以内重複抑制に使用する。なければ None。
    """
    with get_conn() as conn:
        cursor = conn.execute(
            """
            SELECT * FROM signal_history
            WHERE code = ? AND current_signal = ? AND changed_flag = 1
              AND signal_datetime >= ? AND signal_datetime < ?
            ORDER BY signal_datetime DESC LIMIT 1
            """,
            (code, signal, since, before),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_previous_daily_quote(code: str) -> dict | None:
    """
    指定銘柄の前営業日（本日より前の直近日付）の high/low/close を返す。
    daily_quotes は J-Quants の5桁コード（末尾0）で保存されているため、
    4桁コードもその5桁表記もあわせて検索する。
    """
    from datetime import date
    today = str(date.today())
    code_5digit = f"{code}0" if len(code) == 4 else code
    with get_conn() as conn:
        cursor = conn.execute(
            """
            SELECT high, low, close FROM daily_quotes
            WHERE code IN (?, ?) AND date < ?
            ORDER BY date DESC LIMIT 1
            """,
            (code, code_5digit, today),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_codes() -> list[str]:
    """listed_companies に登録されている全銘柄コードを返す"""
    with get_conn() as conn:
        cursor = conn.execute("SELECT code FROM listed_companies ORDER BY code")
        return [row["code"] for row in cursor.fetchall()]


def get_latest_quote_date() -> str | None:
    """daily_quotes の最新日付を返す（データなければ None）"""
    with get_conn() as conn:
        cursor = conn.execute("SELECT MAX(date) FROM daily_quotes")
        row = cursor.fetchone()
        return row[0] if row and row[0] else None


# ── watchlist ─────────────────────────────────────────────────────────────────


def deactivate_watchlist() -> None:
    """全エントリーを is_active=0 にする（新規登録前の一括無効化用）"""
    with get_conn() as conn:
        conn.execute(
            "UPDATE watchlist SET is_active = 0, updated_at = datetime('now', 'localtime')"
        )
    logger.info("watchlist: 全エントリーを無効化しました")


def upsert_watchlist_entries(rows: list[dict]) -> None:
    """指定銘柄を watchlist に登録（既存コードは is_active=1 に更新）"""
    sql = """
        INSERT INTO watchlist (code, company_name, selected_date, source, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
        ON CONFLICT(code) DO UPDATE SET
            company_name  = excluded.company_name,
            selected_date = excluded.selected_date,
            source        = excluded.source,
            is_active     = 1,
            updated_at    = datetime('now', 'localtime')
    """
    data = [
        (r["code"], r.get("company_name"), r.get("selected_date"), r.get("source"))
        for r in rows
    ]
    with get_conn() as conn:
        conn.executemany(sql, data)
    logger.info("watchlist 登録: %d 件", len(data))


def get_active_watchlist() -> list[dict]:
    """is_active=1 の銘柄一覧を返す"""
    with get_conn() as conn:
        cursor = conn.execute(
            "SELECT code, company_name, selected_date, source FROM watchlist WHERE is_active = 1 ORDER BY rowid"
        )
        return [dict(row) for row in cursor.fetchall()]
