"""
SQLite CRUD for orders, positions, daily_summary, daily_candidates.
"""

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

from src.config import DB_PATH


def init_db(db_path: Path = DB_PATH) -> None:
    db_path.parent.mkdir(exist_ok=True)
    with _connect(db_path) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id     TEXT PRIMARY KEY,
            symbol       TEXT NOT NULL,
            symbol_name  TEXT,
            side         TEXT NOT NULL,
            qty          INTEGER NOT NULL,
            price        REAL NOT NULL,
            status       TEXT NOT NULL,
            ordered_at   TEXT NOT NULL,
            filled_at    TEXT,
            filled_price REAL,
            created_at   TEXT NOT NULL,
            dry_run      INTEGER DEFAULT 0,
            entry_path   TEXT DEFAULT 'A',
            entry_score               REAL,
            entry_surge_score         REAL,
            entry_surge_signal        TEXT,
            entry_surge_confirm_count INTEGER,
            entry_reasons             TEXT
        );

        CREATE TABLE IF NOT EXISTS positions (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol         TEXT NOT NULL,
            symbol_name    TEXT,
            qty            INTEGER NOT NULL,
            entry_price    REAL NOT NULL,
            entry_order_id TEXT NOT NULL,
            status         TEXT NOT NULL,
            opened_at      TEXT NOT NULL,
            closed_at      TEXT,
            close_price    REAL,
            close_reason   TEXT,
            pnl            REAL,
            pnl_pct        REAL,
            dry_run        INTEGER DEFAULT 0,
            entry_path     TEXT DEFAULT 'A',
            max_pnl_pct    REAL,
            entry_score               REAL,
            entry_surge_score         REAL,
            entry_surge_signal        TEXT,
            entry_surge_confirm_count INTEGER,
            entry_reasons             TEXT,
            closing_order_id     TEXT,
            closing_filled_qty   INTEGER DEFAULT 0,
            closing_filled_value REAL    DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS daily_summary (
            date         TEXT PRIMARY KEY,
            total_trades INTEGER DEFAULT 0,
            win_count    INTEGER DEFAULT 0,
            loss_count   INTEGER DEFAULT 0,
            total_pnl    REAL    DEFAULT 0.0,
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_candidates (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            date                 TEXT NOT NULL,
            symbol               TEXT NOT NULL,
            symbol_name          TEXT,
            current_price        REAL,
            score                REAL,
            reasons              TEXT,
            fetched_at           TEXT NOT NULL,
            -- surge_score 関連（ALTER TABLE で後付け可）
            surge_score          REAL,
            surge_signal         TEXT,
            surge_reason         TEXT,
            surge_score_delta    REAL,
            volume_spike_ratio   REAL,
            turnover_spike_ratio REAL,
            price_change_1m      REAL,
            price_change_3m      REAL,
            price_change_5m      REAL,
            near_day_high_ratio  REAL,
            vwap_position        REAL,
            last_surge_checked_at TEXT,
            -- Claude 寄り付き前フィルタ（ALTER TABLE で後付け可）
            llm_selected         INTEGER,
            llm_reason           TEXT,
            UNIQUE(date, symbol)
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            symbol       TEXT PRIMARY KEY,
            held         INTEGER NOT NULL DEFAULT 0,
            entry_price  REAL,
            qty          INTEGER,
            memo         TEXT,
            added_at     TEXT NOT NULL
        );

        -- Phase0（V2設計書）: 現行ロジックの計測・検証基盤。
        -- 売買判定には一切使用しない。観測専用テーブル。

        CREATE TABLE IF NOT EXISTS signal_history (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp             TEXT NOT NULL,
            symbol                TEXT NOT NULL,
            price                 REAL,
            previous_signal       TEXT,
            current_signal        TEXT NOT NULL,
            surge_score           REAL,
            surge_state           TEXT,
            surge_reason          TEXT,
            vwap                  REAL,
            volume_spike_ratio    REAL,
            turnover_spike_ratio  REAL,
            near_day_high_ratio   REAL,
            one_hour_trend        TEXT,
            claude_result         TEXT,
            claude_reason         TEXT,
            entry_allowed         INTEGER,
            no_entry_reason       TEXT,
            strategy_version      TEXT NOT NULL DEFAULT 'v1_pathd'
        );
        CREATE INDEX IF NOT EXISTS idx_signal_history_symbol_ts
            ON signal_history(symbol, timestamp);

        CREATE TABLE IF NOT EXISTS candidate_outcomes (
            candidate_id      TEXT PRIMARY KEY,
            symbol            TEXT NOT NULL,
            signal_time       TEXT NOT NULL,
            signal_price      REAL NOT NULL,
            signal_type       TEXT,
            entered           INTEGER NOT NULL DEFAULT 0,
            no_entry_reason   TEXT,
            price_after_5m    REAL,
            price_after_10m   REAL,
            price_after_15m   REAL,
            price_after_30m   REAL,
            max_price         REAL,
            min_price         REAL,
            max_upside_pct    REAL,
            max_downside_pct  REAL,
            mfe_pct           REAL,
            mae_pct           REAL,
            first_touch       TEXT,
            tracking_done     INTEGER NOT NULL DEFAULT 0,
            strategy_version  TEXT NOT NULL DEFAULT 'v1_pathd'
        );
        CREATE INDEX IF NOT EXISTS idx_candidate_outcomes_symbol
            ON candidate_outcomes(symbol, signal_time);

        CREATE TABLE IF NOT EXISTS performance_snapshots (
            date              TEXT NOT NULL,
            strategy_version  TEXT NOT NULL DEFAULT 'v1_pathd',
            metrics_json      TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            PRIMARY KEY (date, strategy_version)
        );
        """)
        # 既存 DB への列追加マイグレーション
        _migrate_daily_candidates(conn)
        _migrate_orders(conn)
        _migrate_positions(conn)
        # symbol UNIQUE 制約の除去（entry_path 列が保証された後に実行する必要がある）
        _migrate_positions_drop_symbol_unique(conn)
        # OPEN ポジションは銘柄×dry_run につき1件までを保証する（履歴は複数保持可能）
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_open_symbol "
            "ON positions(symbol, dry_run) WHERE status='OPEN'"
        )


_SURGE_COLUMNS = [
    ("surge_score",          "REAL"),
    ("surge_signal",         "TEXT"),
    ("surge_reason",         "TEXT"),
    ("surge_score_delta",    "REAL"),
    ("volume_spike_ratio",   "REAL"),
    ("turnover_spike_ratio", "REAL"),
    ("price_change_1m",      "REAL"),
    ("price_change_3m",      "REAL"),
    ("price_change_5m",      "REAL"),
    ("near_day_high_ratio",  "REAL"),
    ("vwap_position",        "REAL"),
    ("last_surge_checked_at","TEXT"),
]

_LLM_PREFILTER_COLUMNS = [
    ("llm_selected", "INTEGER"),
    ("llm_reason",   "TEXT"),
]


def _migrate_daily_candidates(conn: sqlite3.Connection) -> None:
    """daily_candidates に surge_score / llm_selected 関連列が無ければ追加する。"""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(daily_candidates)")}
    for col, typ in _SURGE_COLUMNS + _LLM_PREFILTER_COLUMNS:
        if col not in existing:
            conn.execute(f"ALTER TABLE daily_candidates ADD COLUMN {col} {typ}")


_ENTRY_SIGNAL_COLUMNS = [
    ("entry_score",               "REAL"),
    ("entry_surge_score",         "REAL"),
    ("entry_surge_signal",        "TEXT"),
    ("entry_surge_confirm_count", "INTEGER"),
    ("entry_reasons",             "TEXT"),
]

_CLOSING_COLUMNS = [
    ("closing_order_id",     "TEXT", "NULL"),
    ("closing_filled_qty",   "INTEGER", "0"),
    ("closing_filled_value", "REAL", "0"),
]


def _migrate_orders(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(orders)")}
    if "entry_path" not in existing:
        conn.execute("ALTER TABLE orders ADD COLUMN entry_path TEXT DEFAULT 'A'")
    for col, typ in _ENTRY_SIGNAL_COLUMNS:
        if col not in existing:
            conn.execute(f"ALTER TABLE orders ADD COLUMN {col} {typ}")


def _migrate_positions(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(positions)")}
    if "entry_path" not in existing:
        conn.execute("ALTER TABLE positions ADD COLUMN entry_path TEXT DEFAULT 'A'")
    if "max_pnl_pct" not in existing:
        conn.execute("ALTER TABLE positions ADD COLUMN max_pnl_pct REAL")
    for col, typ in _ENTRY_SIGNAL_COLUMNS:
        if col not in existing:
            conn.execute(f"ALTER TABLE positions ADD COLUMN {col} {typ}")
    for col, typ, default in _CLOSING_COLUMNS:
        if col not in existing:
            conn.execute(f"ALTER TABLE positions ADD COLUMN {col} {typ} DEFAULT {default}")


def _migrate_positions_drop_symbol_unique(conn: sqlite3.Connection) -> None:
    """positions.symbol の UNIQUE 制約を除去する。

    旧スキーマは symbol UNIQUE + insert_position の INSERT OR REPLACE により、
    同一銘柄を再エントリーすると過去の決済済み取引（entry_price/pnl/close_reason 等）が
    黙って上書き消失していた。テーブルを作り直して制約なしに移行し、
    「OPEN は銘柄×dry_run につき1件まで」は別途 idx_positions_open_symbol で担保する。
    """
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='positions'"
    ).fetchone()
    if row is None or row[0] is None or "UNIQUE" not in row[0]:
        return  # 新規作成 or 移行済み

    conn.executescript("""
        ALTER TABLE positions RENAME TO positions_pre_migration;

        CREATE TABLE positions (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol         TEXT NOT NULL,
            symbol_name    TEXT,
            qty            INTEGER NOT NULL,
            entry_price    REAL NOT NULL,
            entry_order_id TEXT NOT NULL,
            status         TEXT NOT NULL,
            opened_at      TEXT NOT NULL,
            closed_at      TEXT,
            close_price    REAL,
            close_reason   TEXT,
            pnl            REAL,
            pnl_pct        REAL,
            dry_run        INTEGER DEFAULT 0,
            entry_path     TEXT DEFAULT 'A',
            max_pnl_pct    REAL,
            entry_score               REAL,
            entry_surge_score         REAL,
            entry_surge_signal        TEXT,
            entry_surge_confirm_count INTEGER,
            entry_reasons             TEXT,
            closing_order_id     TEXT,
            closing_filled_qty   INTEGER DEFAULT 0,
            closing_filled_value REAL    DEFAULT 0
        );

        INSERT INTO positions (
            id, symbol, symbol_name, qty, entry_price, entry_order_id,
            status, opened_at, closed_at, close_price, close_reason,
            pnl, pnl_pct, dry_run, entry_path, max_pnl_pct,
            entry_score, entry_surge_score, entry_surge_signal,
            entry_surge_confirm_count, entry_reasons,
            closing_order_id, closing_filled_qty, closing_filled_value
        )
        SELECT
            id, symbol, symbol_name, qty, entry_price, entry_order_id,
            status, opened_at, closed_at, close_price, close_reason,
            pnl, pnl_pct, dry_run, entry_path, max_pnl_pct,
            entry_score, entry_surge_score, entry_surge_signal,
            entry_surge_confirm_count, entry_reasons,
            closing_order_id, closing_filled_qty, closing_filled_value
        FROM positions_pre_migration;

        DROP TABLE positions_pre_migration;
    """)


@contextmanager
def _connect(db_path: Path = DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _today() -> str:
    return date.today().isoformat()


# ─── orders ──────────────────────────────────────────────────────────────────

def insert_order(
    order_id: str,
    symbol: str,
    symbol_name: str,
    side: str,
    qty: int,
    price: float,
    status: str,
    ordered_at: str,
    dry_run: bool = False,
    entry_path: str = "A",
    entry_signal: dict | None = None,
    db_path: Path = DB_PATH,
) -> None:
    """entry_signal: エントリー時点のスコア・surge値のスナップショット。
    {"score", "surge_score", "surge_signal", "surge_confirm_count", "reasons"} を想定（買い注文のみ）。
    """
    sig = entry_signal or {}
    with _connect(db_path) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO orders
               (order_id, symbol, symbol_name, side, qty, price, status,
                ordered_at, created_at, dry_run, entry_path,
                entry_score, entry_surge_score, entry_surge_signal,
                entry_surge_confirm_count, entry_reasons)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (order_id, symbol, symbol_name, side, qty, price, status,
             ordered_at, _now(), int(dry_run), entry_path,
             sig.get("score"), sig.get("surge_score"), sig.get("surge_signal"),
             sig.get("surge_confirm_count"), sig.get("reasons")),
        )


def update_order_filled(
    order_id: str,
    filled_price: float,
    db_path: Path = DB_PATH,
) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE orders SET status='FILLED', filled_at=?, filled_price=? WHERE order_id=?",
            (_now(), filled_price, order_id),
        )


def update_order_status(
    order_id: str,
    status: str,
    db_path: Path = DB_PATH,
) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE orders SET status=? WHERE order_id=?",
            (status, order_id),
        )


def get_pending_orders(dry_run: bool = False, db_path: Path = DB_PATH) -> list[dict]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM orders WHERE status='PENDING' AND dry_run=?",
            (int(dry_run),),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── positions ───────────────────────────────────────────────────────────────

def insert_position(
    symbol: str,
    symbol_name: str,
    qty: int,
    entry_price: float,
    entry_order_id: str,
    dry_run: bool = False,
    entry_path: str = "A",
    entry_signal: dict | None = None,
    db_path: Path = DB_PATH,
) -> None:
    """entry_signal: エントリー時点のスコア・surge値のスナップショット。
    {"score", "surge_score", "surge_signal", "surge_confirm_count", "reasons"} を想定。
    """
    sig = entry_signal or {}
    with _connect(db_path) as conn:
        conn.execute(
            """INSERT INTO positions
               (symbol, symbol_name, qty, entry_price, entry_order_id,
                status, opened_at, dry_run, entry_path,
                entry_score, entry_surge_score, entry_surge_signal,
                entry_surge_confirm_count, entry_reasons)
               VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (symbol, symbol_name, qty, entry_price, entry_order_id,
             _now(), int(dry_run), entry_path,
             sig.get("score"), sig.get("surge_score"), sig.get("surge_signal"),
             sig.get("surge_confirm_count"), sig.get("reasons")),
        )


def get_open_positions(
    dry_run: bool = False,
    include_closing: bool = False,
    db_path: Path = DB_PATH,
) -> list[dict]:
    """OPENポジションを返す。include_closing=Trueなら売り注文確認待ち(CLOSING)も含める
    （資金・保有数の判定など、実際にまだ株を保有している間は考慮すべき用途向け）。
    """
    status_clause = "status IN ('OPEN','CLOSING')" if include_closing else "status='OPEN'"
    with _connect(db_path) as conn:
        rows = conn.execute(
            f"SELECT * FROM positions WHERE {status_clause} AND dry_run=?",
            (int(dry_run),),
        ).fetchall()
    return [dict(r) for r in rows]


def get_closing_positions(dry_run: bool = False, db_path: Path = DB_PATH) -> list[dict]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE status='CLOSING' AND dry_run=?",
            (int(dry_run),),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_position_closing(
    symbol: str,
    order_id: str,
    reason: str,
    dry_run: bool = False,
    db_path: Path = DB_PATH,
) -> None:
    """売り注文を発行したがまだ約定未確認のポジションをCLOSING状態にする。

    OPENから除外されるため、次tickで同じポジションに二重で売り注文が
    飛ぶことも防げる。close_reasonはここで仮登録し、約定確定時にそのまま使う。
    """
    with _connect(db_path) as conn:
        conn.execute(
            """UPDATE positions
               SET status='CLOSING', closing_order_id=?, close_reason=?,
                   closing_filled_qty=0, closing_filled_value=0
               WHERE symbol=? AND status='OPEN' AND dry_run=?""",
            (order_id, reason, symbol, int(dry_run)),
        )


def update_closing_order_id(
    symbol: str,
    order_id: str,
    dry_run: bool = False,
    db_path: Path = DB_PATH,
) -> None:
    """タイムアウト後の売り再発注時に、紐付ける注文IDを更新する。"""
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE positions SET closing_order_id=? WHERE symbol=? AND status='CLOSING' AND dry_run=?",
            (order_id, symbol, int(dry_run)),
        )


def record_closing_fill(
    symbol: str,
    dry_run: bool,
    filled_qty: int,
    filled_price: float,
    db_path: Path = DB_PATH,
) -> dict | None:
    """CLOSING中ポジションへの約定（全数 or 部分）を積み上げる。

    積算約定数がポジション数量に達したら加重平均価格でCLOSEDに確定し、
    確定結果（close_price/pnl/pnl_pct/close_reason等）を返す。
    未確定（まだ一部しか埋まっていない）場合は None を返す。
    """
    with _connect(db_path) as conn:
        conn.execute(
            """UPDATE positions
               SET closing_filled_qty = COALESCE(closing_filled_qty, 0) + ?,
                   closing_filled_value = COALESCE(closing_filled_value, 0) + ?
               WHERE symbol=? AND status='CLOSING' AND dry_run=?""",
            (filled_qty, filled_qty * filled_price, symbol, int(dry_run)),
        )
        row = conn.execute(
            "SELECT * FROM positions WHERE symbol=? AND status='CLOSING' AND dry_run=?",
            (symbol, int(dry_run)),
        ).fetchone()
        if row is None:
            return None
        pos = dict(row)
        if pos["closing_filled_qty"] < pos["qty"]:
            return None

        avg_price = pos["closing_filled_value"] / pos["closing_filled_qty"]
        entry     = pos["entry_price"]
        pnl       = (avg_price - entry) * pos["qty"]
        pnl_pct   = (avg_price - entry) / entry * 100
        conn.execute(
            """UPDATE positions
               SET status='CLOSED', closed_at=?, close_price=?, pnl=?, pnl_pct=?
               WHERE symbol=? AND status='CLOSING' AND dry_run=?""",
            (_now(), avg_price, pnl, pnl_pct, symbol, int(dry_run)),
        )
        pos.update(status="CLOSED", closed_at=_now(), close_price=avg_price, pnl=pnl, pnl_pct=pnl_pct)
        return pos


def close_position(
    symbol: str,
    close_price: float,
    close_reason: str,
    pnl: float,
    pnl_pct: float,
    db_path: Path = DB_PATH,
) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            """UPDATE positions
               SET status='CLOSED', closed_at=?, close_price=?,
                   close_reason=?, pnl=?, pnl_pct=?
               WHERE symbol=? AND status='OPEN'""",
            (_now(), close_price, close_reason, pnl, pnl_pct, symbol),
        )


def update_position_max_pnl_pct(
    symbol: str,
    pnl_pct: float,
    dry_run: bool = False,
    db_path: Path = DB_PATH,
) -> None:
    """OPEN ポジションの当日最大含み益率を更新する（キープゾーン検証用の観測データ）。"""
    with _connect(db_path) as conn:
        conn.execute(
            """UPDATE positions
               SET max_pnl_pct = MAX(COALESCE(max_pnl_pct, ?), ?)
               WHERE symbol=? AND status='OPEN' AND dry_run=?""",
            (pnl_pct, pnl_pct, symbol, int(dry_run)),
        )


def get_last_closed_time_today(
    symbol: str,
    dry_run: bool = False,
    db_path: Path = DB_PATH,
) -> str | None:
    """当日のその銘柄の直近クローズ時刻を返す（同一銘柄再エントリークールダウン判定用）。"""
    today = _today()
    with _connect(db_path) as conn:
        row = conn.execute(
            """SELECT closed_at FROM positions
               WHERE symbol=? AND status='CLOSED' AND DATE(closed_at)=? AND dry_run=?
               ORDER BY closed_at DESC LIMIT 1""",
            (symbol, today, int(dry_run)),
        ).fetchone()
    return row[0] if row else None


def get_today_closed_positions(dry_run: bool = False, db_path: Path = DB_PATH) -> list[dict]:
    today = _today()
    with _connect(db_path) as conn:
        rows = conn.execute(
            """SELECT symbol, symbol_name, entry_price, close_price,
                      close_reason, pnl, pnl_pct, opened_at, closed_at
               FROM positions
               WHERE status='CLOSED' AND DATE(closed_at)=? AND dry_run=?
               ORDER BY closed_at""",
            (today, int(dry_run)),
        ).fetchall()
    return [dict(r) for r in rows]


def has_open_position(symbol: str, dry_run: bool = False, db_path: Path = DB_PATH) -> bool:
    """OPENまたはCLOSING（売り約定確認待ち）のポジションがあるか。

    CLOSING中も実際にはまだ株を保有しているため、同一銘柄への新規買いを
    ブロックする対象に含める。
    """
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM positions WHERE symbol=? AND status IN ('OPEN','CLOSING') AND dry_run=?",
            (symbol, int(dry_run)),
        ).fetchone()
    return row is not None


# ─── daily_summary ───────────────────────────────────────────────────────────

def upsert_daily_summary(
    total_trades: int,
    win_count: int,
    loss_count: int,
    total_pnl: float,
    db_path: Path = DB_PATH,
) -> None:
    today = _today()
    with _connect(db_path) as conn:
        conn.execute(
            """INSERT INTO daily_summary (date, total_trades, win_count, loss_count, total_pnl, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET
                 total_trades=excluded.total_trades,
                 win_count=excluded.win_count,
                 loss_count=excluded.loss_count,
                 total_pnl=excluded.total_pnl""",
            (today, total_trades, win_count, loss_count, total_pnl, _now()),
        )


def get_today_closed_pnl(dry_run: bool = False, db_path: Path = DB_PATH) -> float:
    today = _today()
    with _connect(db_path) as conn:
        row = conn.execute(
            """SELECT COALESCE(SUM(pnl), 0) FROM positions
               WHERE status='CLOSED' AND DATE(closed_at)=? AND dry_run=?""",
            (today, int(dry_run)),
        ).fetchone()
    return float(row[0]) if row else 0.0


def get_cumulative_pnl(dry_run: bool = False, db_path: Path = DB_PATH) -> float:
    """全期間の実現損益合計を返す（資金の段階的引き上げに使用）。"""
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(pnl), 0) FROM positions WHERE status='CLOSED' AND dry_run=?",
            (int(dry_run),),
        ).fetchone()
    return float(row[0]) if row else 0.0


# ─── daily_candidates ────────────────────────────────────────────────────────

def save_daily_candidates(candidates: list[dict], db_path: Path = DB_PATH) -> None:
    today = _today()
    fetched_at = _now()
    with _connect(db_path) as conn:
        for c in candidates:
            conn.execute(
                """INSERT INTO daily_candidates
                   (date, symbol, symbol_name, current_price, score, reasons, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(date, symbol) DO UPDATE SET
                     current_price=excluded.current_price,
                     score=excluded.score,
                     reasons=excluded.reasons,
                     fetched_at=excluded.fetched_at""",
                (today, c.get("Symbol", "") or c.get("symbol", ""),
                 c.get("SymbolName", "") or c.get("symbol_name", ""),
                 c.get("CurrentPrice") or c.get("current_price"),
                 c.get("score"), c.get("reasons"),
                 fetched_at),
            )


def save_surge_score(
    symbol: str,
    surge_score: float,
    surge_signal: str,
    surge_reason: str,
    surge_score_delta: float,
    volume_spike_ratio: float,
    turnover_spike_ratio: float,
    price_change_1m: float,
    price_change_3m: float,
    price_change_5m: float,
    near_day_high_ratio: float,
    vwap_position: float,
    db_path: Path = DB_PATH,
) -> None:
    """daily_candidates の surge_score 関連列を更新する。"""
    today = _today()
    with _connect(db_path) as conn:
        conn.execute(
            """UPDATE daily_candidates SET
               surge_score=?, surge_signal=?, surge_reason=?,
               surge_score_delta=?, volume_spike_ratio=?, turnover_spike_ratio=?,
               price_change_1m=?, price_change_3m=?, price_change_5m=?,
               near_day_high_ratio=?, vwap_position=?, last_surge_checked_at=?
               WHERE date=? AND symbol=?""",
            (surge_score, surge_signal, surge_reason,
             surge_score_delta, volume_spike_ratio, turnover_spike_ratio,
             price_change_1m, price_change_3m, price_change_5m,
             near_day_high_ratio, vwap_position, _now(),
             today, symbol),
        )


def get_latest_surge_data(symbol: str, db_path: Path = DB_PATH) -> dict | None:
    """本日の最新 surge スコアデータを返す（Claude TP advisor に渡す）。"""
    today = _today()
    with _connect(db_path) as conn:
        row = conn.execute(
            """SELECT surge_score, surge_signal, surge_reason,
                      volume_spike_ratio, turnover_spike_ratio,
                      price_change_1m, price_change_3m, price_change_5m,
                      vwap_position, near_day_high_ratio
               FROM daily_candidates WHERE date=? AND symbol=?""",
            (today, symbol),
        ).fetchone()
    return dict(row) if row else None


def get_previous_surge_score(symbol: str, db_path: Path = DB_PATH) -> float | None:
    """直近の surge_score を返す（未計算なら None）。"""
    today = _today()
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT surge_score FROM daily_candidates WHERE date=? AND symbol=?",
            (today, symbol),
        ).fetchone()
    if row and row[0] is not None:
        return float(row[0])
    return None


def get_daily_candidates(db_path: Path = DB_PATH) -> list[dict]:
    today = _today()
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM daily_candidates WHERE date=? ORDER BY score DESC",
            (today,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_recent_candidate_history(
    symbol: str,
    before_date: str | None = None,
    within_days: int = 7,
    db_path: Path = DB_PATH,
) -> list[dict]:
    """指定銘柄の直近 within_days 日（before_date を含まない）分の
    daily_candidates 履歴を新しい順で返す。連続候補入り・スコア推移の
    判定に使う（Claude寄り付き前フィルタの追加材料）。

    戻り値: [{"date": ..., "score": ..., "llm_selected": ...}, ...]（新しい順）
    """
    ref = before_date or _today()
    with _connect(db_path) as conn:
        rows = conn.execute(
            """SELECT date, score, llm_selected FROM daily_candidates
               WHERE symbol=? AND date<? AND date>=date(?, ?)
               ORDER BY date DESC""",
            (symbol, ref, ref, f"-{within_days} days"),
        ).fetchall()
    return [dict(r) for r in rows]


# ─── watchlist（--watch-add / --watch-remove / --watch-list / --advise） ──────

def add_watchlist_symbol(
    symbol: str,
    held: bool = False,
    entry_price: float | None = None,
    qty: int | None = None,
    memo: str | None = None,
    db_path: Path = DB_PATH,
) -> None:
    """ウォッチリストに銘柄を登録する。既に登録済みの場合は上書き更新する。"""
    with _connect(db_path) as conn:
        conn.execute(
            """INSERT INTO watchlist (symbol, held, entry_price, qty, memo, added_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol) DO UPDATE SET
                 held=excluded.held,
                 entry_price=excluded.entry_price,
                 qty=excluded.qty,
                 memo=excluded.memo,
                 added_at=excluded.added_at""",
            (symbol, int(held), entry_price, qty, memo, _now()),
        )


def remove_watchlist_symbol(symbol: str, db_path: Path = DB_PATH) -> bool:
    """ウォッチリストから銘柄を削除する。削除した場合True、対象が無ければFalse。"""
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM watchlist WHERE symbol=?", (symbol,))
        return cur.rowcount > 0


def get_watchlist(db_path: Path = DB_PATH) -> list[dict]:
    """登録日時順（古い順）でウォッチリスト全件を返す。"""
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at").fetchall()
    return [dict(r) for r in rows]


def save_llm_prefilter(
    evaluated_symbols: list[str],
    selected: dict[str, str],
    db_path: Path = DB_PATH,
) -> None:
    """Claude 寄り付き前フィルタの結果を保存する。

    evaluated_symbols: Claude に提示した全銘柄（選定されなければ llm_selected=0 になる）
    selected: {symbol: reason} 選定された銘柄と理由
    未評価（このフィルタを一度も通っていない）銘柄は llm_selected=NULL のまま残る。
    """
    today = _today()
    with _connect(db_path) as conn:
        for sym in evaluated_symbols:
            reason = selected.get(sym)
            conn.execute(
                """UPDATE daily_candidates
                   SET llm_selected=?, llm_reason=?
                   WHERE date=? AND symbol=?""",
                (int(sym in selected), reason, today, sym),
            )


# ─── Phase0: signal_history / candidate_outcomes / performance_snapshots ──────
# 観測専用。売買判定には一切使用しない（V2設計書 Phase0）。

def insert_signal_history(row: dict, db_path: Path = DB_PATH) -> None:
    """signal_history に1件追加する（重複防止は呼び出し側=signal_repository.pyの責務）。"""
    cols = [
        "timestamp", "symbol", "price", "previous_signal", "current_signal",
        "surge_score", "surge_state", "surge_reason", "vwap",
        "volume_spike_ratio", "turnover_spike_ratio", "near_day_high_ratio",
        "one_hour_trend", "claude_result", "claude_reason",
        "entry_allowed", "no_entry_reason", "strategy_version",
    ]
    values = [row.get(c) for c in cols]
    placeholders = ", ".join("?" for _ in cols)
    with _connect(db_path) as conn:
        conn.execute(
            f"INSERT INTO signal_history ({', '.join(cols)}) VALUES ({placeholders})",
            values,
        )


def get_last_signal(symbol: str, db_path: Path = DB_PATH) -> dict | None:
    """指定銘柄の直近のsignal_history行を返す（previous_signal算出用）。"""
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM signal_history WHERE symbol=? ORDER BY id DESC LIMIT 1",
            (symbol,),
        ).fetchone()
    return dict(row) if row else None


def insert_candidate_outcome(row: dict, db_path: Path = DB_PATH) -> None:
    """candidate_outcomes に1件追加する（候補発生時点の初期値のみ）。"""
    cols = [
        "candidate_id", "symbol", "signal_time", "signal_price", "signal_type",
        "entered", "no_entry_reason", "max_price", "min_price", "strategy_version",
    ]
    values = [row.get(c) for c in cols]
    placeholders = ", ".join("?" for _ in cols)
    with _connect(db_path) as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO candidate_outcomes ({', '.join(cols)}) "
            f"VALUES ({placeholders})",
            values,
        )


def get_pending_candidate_outcomes(db_path: Path = DB_PATH) -> list[dict]:
    """まだ追跡完了（30分経過）していない候補を返す。"""
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM candidate_outcomes WHERE tracking_done=0"
        ).fetchall()
    return [dict(r) for r in rows]


def update_candidate_outcome(candidate_id: str, fields: dict, db_path: Path = DB_PATH) -> None:
    """candidate_outcomes の指定行を部分更新する。"""
    if not fields:
        return
    set_clause = ", ".join(f"{k}=?" for k in fields)
    with _connect(db_path) as conn:
        conn.execute(
            f"UPDATE candidate_outcomes SET {set_clause} WHERE candidate_id=?",
            (*fields.values(), candidate_id),
        )


def save_performance_snapshot(
    date_str: str, strategy_version: str, metrics_json: str, db_path: Path = DB_PATH,
) -> None:
    """performance_snapshots に日次スナップショットを保存（同日同versionは上書き）。"""
    with _connect(db_path) as conn:
        conn.execute(
            """INSERT INTO performance_snapshots (date, strategy_version, metrics_json, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(date, strategy_version) DO UPDATE SET
                 metrics_json=excluded.metrics_json, created_at=excluded.created_at""",
            (date_str, strategy_version, metrics_json, _now()),
        )
