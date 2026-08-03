import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

API_PASSWORD: str = os.getenv("API_PASSWORD", "")
KABU_ENV: str = os.getenv("KABU_ENV", "test").lower()
EXCHANGE_DIVISION: str = os.getenv("EXCHANGE_DIVISION", "TP")

BASE_URL: str = (
    "http://localhost:18080/kabusapi"
    if KABU_ENV == "prod"
    else "http://localhost:18081/kabusapi"
)

MIN_TRADING_VOLUME: int = int(os.getenv("MIN_TRADING_VOLUME", "10000"))

RANKING_TYPES: list[int] = [1, 6, 7]

SCORE_PRICE_CHANGE: int = 25
SCORE_VOLUME:       int = 25
SCORE_TURNOVER:     int = 30

# 取引関連
ORDER_PASSWORD: str = os.getenv("ORDER_PASSWORD", "")
LINE_CHANNEL_ACCESS_TOKEN: str = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_USER_ID: str = os.getenv("LINE_USER_ID", "")
NTFY_TOPIC: str = os.getenv("NTFY_TOPIC", "")
NTFY_URL: str = os.getenv("NTFY_URL", "https://ntfy.sh")
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

DB_PATH: Path = Path(__file__).parent.parent / "data" / "trades.db"


def load_settings() -> dict:
    path = Path(__file__).parent.parent / "settings.yaml"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _get(settings: dict, *keys, default=None):
    d = settings
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k, default)
    return d


_SETTINGS = load_settings()
_T = _SETTINGS.get("trade", {})
_E = _SETTINGS.get("entry_policy", {})
_S = _SETTINGS.get("surge", {})

CAPITAL: float              = float(_T.get("capital", 100000))
ORDER_QTY: int              = int(_T.get("order_qty", 100))
MAX_POSITIONS: int          = int(_T.get("max_positions", 5))
# 呼値（最小値幅）が%ベースの損切り/利確ラインに対して粗くなりすぎる超低位株を除外する
MIN_STOCK_PRICE: float      = float(_T.get("min_stock_price", 100))
STOP_LOSS_PCT: float             = float(_T.get("stop_loss_pct", -3.0))
TAKE_PROFIT_PCT: float           = float(_T.get("take_profit_pct", 8.0))
TAKE_PROFIT_RCI_THRESHOLD: float = float(_T.get("take_profit_rci_threshold", 80.0))
TAKE_PROFIT_TRAILING_PCT: float  = float(_T.get("take_profit_trailing_pct", 3.0))
# 利益ロック（tp_pct到達前の無防備地帯対策）: tp_pctに対する比率でトリガーが決まる
PROFIT_LOCK_BREAKEVEN_TRIGGER_RATIO: float = float(_T.get("profit_lock_breakeven_trigger_ratio", 0.25))
PROFIT_LOCK_BREAKEVEN_FLOOR_PCT: float     = float(_T.get("profit_lock_breakeven_floor_pct", 0.5))
PROFIT_LOCK_PARTIAL_TRIGGER_RATIO: float   = float(_T.get("profit_lock_partial_trigger_ratio", 0.5))
PROFIT_LOCK_PARTIAL_TRAIL_PCT: float       = float(_T.get("profit_lock_partial_trail_pct", 2.0))
ORDER_TIMEOUT_MIN: int      = int(_T.get("order_timeout_minutes", 3))
POLLING_INTERVAL: int       = int(_T.get("polling_interval_seconds", 60))
# 保有ポジションの損切り/利確監視の間隔（新規エントリー探索より高頻度に回す）
POSITION_CHECK_INTERVAL_SEC: int = int(_T.get("position_check_interval_seconds", 10))
PRE_MARKET_YFINANCE_TIME: str = str(_T.get("pre_market_yfinance_time", "08:00"))
PRE_MARKET_SCAN_TIME: str   = str(_T.get("pre_market_scan_time", "08:45"))
# Claude 寄り付き前フィルタ（気配値ベース）
PRE_MARKET_LLM_ENABLED: bool       = bool(_T.get("pre_market_llm_enabled", True))
PRE_MARKET_LLM_TIME: str           = str(_T.get("pre_market_llm_time", "08:30"))
PRE_MARKET_LLM_MODEL: str          = str(_T.get("pre_market_llm_model", "claude-opus-4-8"))
PRE_MARKET_LLM_UNIVERSE_SIZE: int  = int(_T.get("pre_market_llm_universe_size", 25))
PRE_MARKET_LLM_TOP_N: int          = int(_T.get("pre_market_llm_top_n", 10))
FORCE_CLOSE_TIME: str       = str(_T.get("force_close_time", "15:20"))
MIN_SCORE_TO_ENTER: float   = float(_T.get("min_score_to_enter", 60.0))
DAILY_LOSS_LIMIT: float     = float(_T.get("daily_loss_limit", -30000))
# 同一銘柄を当日決済後、再エントリーまでの待機時間（分）。0で無効
REENTRY_COOLDOWN_MIN: int   = int(_T.get("reentry_cooldown_minutes", 60))
CASH_MARGIN: int            = int(_T.get("cash_margin", 1))
ACCOUNT_TYPE: int           = int(_T.get("account_type", 4))
TRADING_SESSIONS: list      = _T.get("trading_sessions", [{"start": "09:00", "end": "09:30"}])
# 各セッション開始直後は板が薄く反転しやすいため、この分数だけ新規エントリーを見送る（0で無効）
ENTRY_EMBARGO_MIN: int      = int(_T.get("entry_embargo_minutes", 15))
TRADE_EXCHANGE: str         = str(_T.get("exchange", EXCHANGE_DIVISION))

ENTRY_POLICY_ENABLED: bool  = bool(_E.get("enabled", True))
HOURLY_MA_SHORT: int        = int(_E.get("hourly_ma_short", 5))
HOURLY_MA_LONG: int         = int(_E.get("hourly_ma_long", 20))
MIN1_MA_PERIOD: int         = int(_E.get("min1_ma_period", 5))
RCI_PERIOD: int             = int(_E.get("rci_period", 9))
RCI_APPROACH_THRESHOLD: float = float(_E.get("rci_approach_threshold", -80))
RCI_LOOKBACK_BARS: int      = int(_E.get("rci_lookback_bars", 10))

# ── 急騰予兆スコア ───────────────────────────────────────────────────────────
USE_SURGE_SCORE_FILTER: bool  = _S.get("use_surge_score_filter", True)
MIN_SURGE_SCORE: float        = float(_S.get("min_surge_score", 70.0))
SURGE_STRONG_SCORE: float     = float(_S.get("surge_strong_score", 85.0))
SURGE_CANDIDATE_SCORE: float  = float(_S.get("surge_candidate_score", 70.0))
SURGE_WATCH_SCORE: float      = float(_S.get("surge_watch_score", 50.0))
SURGE_NOTIFY_DELTA: float     = float(_S.get("surge_notify_delta", 10.0))
SURGE_NOTIFY_ENABLED: bool    = bool(_S.get("surge_notify_enabled", True))
SURGE_HIST_DAYS: int          = int(_S.get("surge_hist_days", 20))
# 経路B: surge主導バイパス条件
SURGE_BYPASS_MIN_SURGE: float = float(_S.get("bypass_min_surge", 85.0))
SURGE_BYPASS_MIN_SCORE: float = float(_S.get("bypass_min_score", 40.0))
# 発注価格バッファ（急騰中の未約定防止）
ORDER_PRICE_BUFFER_PCT: float = float(_S.get("order_price_buffer_pct", 0.3))
# 経路C: score不問のsurge純粋選出
PATHC_ENABLED: bool           = bool(_S.get("pathc_enabled", True))
PATHC_MIN_SURGE: float        = float(_S.get("pathc_min_surge", 92.0))
# surge 連続確認: この回数連続で閾値超えした場合のみエントリー許可（誤エントリー防止）
SURGE_CONFIRM_MIN: int        = int(_S.get("confirm_min", 2))

# 経路別出口条件
STOP_LOSS_PCT_B: float        = float(_T.get("stop_loss_pct_b",  -2.0))
TAKE_PROFIT_PCT_B: float      = float(_T.get("take_profit_pct_b",  5.0))
STOP_LOSS_PCT_C: float        = float(_T.get("stop_loss_pct_c",  -1.5))
TAKE_PROFIT_PCT_C: float      = float(_T.get("take_profit_pct_c",  3.0))

# ── リアルタイムモニター ─────────────────────────────────────────────────────
_M = _SETTINGS.get("monitor", {})

WS_URL: str                    = str(_M.get("ws_url", "ws://localhost:18080/kabusapi/websocket"))
MONITOR_MAX_SYMBOLS: int       = int(_M.get("max_symbols", 50))
MONITOR_REFRESH_SEC: int       = int(_M.get("refresh_seconds", 10))
MONITOR_RESCAN_MIN: int        = int(_M.get("rescan_minutes", 5))
MONITOR_TOP_N: int             = int(_M.get("top_n", 50))
MONITOR_EXCHANGE: str          = str(_M.get("exchange", EXCHANGE_DIVISION))
WS_RECONNECT_DELAY: int        = int(_M.get("reconnect_delay_seconds", 5))

# ENTRY_SCORE スコアリング配点（合計100点）
SCORE_BUY_DOMINANCE: int       = int(_M.get("score_buy_dominance", 25))
SCORE_IMBALANCE: int           = int(_M.get("score_imbalance", 20))
SCORE_EXPECTED_CHANGE: int     = int(_M.get("score_expected_change", 20))
SCORE_VOLUME_SURGE: int        = int(_M.get("score_volume_surge", 15))
SCORE_VWAP_DEVIATION: int      = int(_M.get("score_vwap_deviation", 15))
SCORE_FLUCTUATION: int         = int(_M.get("score_fluctuation", 5))

# シグナル閾値
SIGNAL_ENTRY: int              = int(_M.get("signal_entry", 85))
SIGNAL_WATCH_STRONG: int       = int(_M.get("signal_watch_strong", 70))
SIGNAL_WATCH: int              = int(_M.get("signal_watch", 55))

# 出来高急増率の基準（1日あたりの平均出来高の推定値：株数）
BASELINE_DAILY_VOLUME: int     = int(_M.get("baseline_daily_volume", 1_000_000))
