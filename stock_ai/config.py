import logging
import os
from datetime import time as _time
from pathlib import Path

import yaml
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
EXCEL_DIR = BASE_DIR / "excel"
LOGS_DIR = BASE_DIR / "logs"
DB_PATH = DATA_DIR / "stocks.db"
SETTINGS_PATH = BASE_DIR / "settings.yaml"

for _d in [DATA_DIR, EXCEL_DIR, LOGS_DIR]:
    _d.mkdir(exist_ok=True)

load_dotenv(BASE_DIR / ".env")

JQUANTS_API_KEY = os.getenv("JQUANTS_API_KEY", "") or os.getenv("JQUANTS_REFRESH_TOKEN", "")

JQUANTS_BASE_URL = "https://api.jquants.com/v2"

# EDINET API（決算モメンタムスコア算出用、無料）
# 取得方法: https://disclosure2.edinet-fsa.go.jp/ でAPIキーを発行し .env に設定する。
# 未設定でもシステムは停止せず、決算モメンタムスコアは0点で処理を継続する。
EDINET_API_KEY = os.getenv("EDINET_API_KEY", "")
if not EDINET_API_KEY:
    logging.getLogger(__name__).warning(
        "EDINET_API_KEY が未設定です。決算モメンタムスコアは0点で処理を継続します。"
    )

# LINE Messaging API（デイトレ判定のシグナル変化通知・Webhook用）
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")
LINE_USER_ID = os.getenv("LINE_USER_ID", "")


# ── デイトレ判定の設定値（settings.yaml で上書き可能） ──────────────
#
# settings.yaml を編集すればコードを直接修正せずに判定条件を変更できる。
# ファイルが無い・読み込めない・項目が不足している場合は、ここに定義した
# デフォルト値（既存の判定ロジックと同じ値）にフォールバックする。

_SETTINGS_DEFAULTS = {
    "trade_decision": {
        "stop_loss_pct":                   -2,
        "take_profit_pct":                 5,
        "bar_change_strong_pct":           4,
        "abnormal_volume_ratio":           5,
        "confirm_bars":                    2,
        "volume_decline_ratio":            0.7,
        "volume_surge_continuation_ratio": 1.5,
        "volume_fading_ratio":             0.7,
        "vwap_near_pct":                   0.01,
        "atr_period":                      14,
        "atr_stop_multiplier":             2,
        "atr_near_pct":                    0.01,
        "min_bars_for_atr":                2,
        "opening_range_start":             "09:00",
        "opening_range_end":               "09:30",
        "entry_score_rank_threshold":      10,
        "entry_score_threshold":           85,
        "watch_candidate_threshold":       70,
        "buy_score_threshold":             85,
        "notify_final_action_buy":         True,
        "notify_final_action_sell":        True,
        "entry_score_points": {
            "vwap_above":                  20,
            "prev_high_breakout":          20,
            "opening_range_breakout":      20,
            "volume_surge_continuation":   20,
            "ranking_top":                 15,
            "market_bull":                 5,
            "market_bear_penalty":         -15,
            "rank_1_3":                    15,
            "rank_4_5":                    12,
            "rank_6_10":                   10,
        },
    },
    "monitoring": {
        "time_limit": "15:20",
    },
    "notification": {
        "duplicate_suppress_window_minutes": 30,
    },
}


def _load_settings() -> dict:
    """settings.yaml を読み込み、不足項目はデフォルトで補って返す"""
    loaded: dict = {}
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                loaded = yaml.safe_load(f) or {}
        except Exception:
            loaded = {}

    merged = {}
    for section, defaults in _SETTINGS_DEFAULTS.items():
        section_loaded = loaded.get(section) or {}
        section_merged = {}
        for key, default_value in defaults.items():
            value = section_loaded.get(key, default_value)
            if isinstance(default_value, dict) and isinstance(value, dict):
                value = {**default_value, **value}
            section_merged[key] = value
        merged[section] = section_merged
    return merged


def _parse_hhmm(value: str) -> _time:
    hour, minute = value.split(":")
    return _time(int(hour), int(minute))


_SETTINGS = _load_settings()
_TD = _SETTINGS["trade_decision"]

STOP_LOSS_PCT = _TD["stop_loss_pct"]
TAKE_PROFIT_PCT = _TD["take_profit_pct"]
BAR_CHANGE_STRONG_PCT = _TD["bar_change_strong_pct"]
ABNORMAL_VOLUME_RATIO = _TD["abnormal_volume_ratio"]
CONFIRM_BARS = _TD["confirm_bars"]
VOLUME_DECLINE_RATIO = _TD["volume_decline_ratio"]
VOLUME_SURGE_CONTINUATION_RATIO = _TD["volume_surge_continuation_ratio"]
VOLUME_FADING_RATIO = _TD["volume_fading_ratio"]
VWAP_NEAR_PCT = _TD["vwap_near_pct"]
ATR_PERIOD = _TD["atr_period"]
ATR_STOP_MULTIPLIER = _TD["atr_stop_multiplier"]
ATR_NEAR_PCT = _TD["atr_near_pct"]
MIN_BARS_FOR_ATR = _TD["min_bars_for_atr"]
OPENING_RANGE_START = _parse_hhmm(_TD["opening_range_start"])
OPENING_RANGE_END = _parse_hhmm(_TD["opening_range_end"])
ENTRY_SCORE_RANK_THRESHOLD = _TD["entry_score_rank_threshold"]
ENTRY_SCORE_THRESHOLD = _TD["entry_score_threshold"]
WATCH_CANDIDATE_THRESHOLD = _TD["watch_candidate_threshold"]
ENTRY_SCORE_POINTS = _TD["entry_score_points"]
BUY_SCORE_THRESHOLD = _TD["buy_score_threshold"]
NOTIFY_FINAL_ACTION_BUY = _TD["notify_final_action_buy"]
NOTIFY_FINAL_ACTION_SELL = _TD["notify_final_action_sell"]

MONITORING_TIME_LIMIT = _parse_hhmm(_SETTINGS["monitoring"]["time_limit"])

DUPLICATE_SUPPRESS_WINDOW_MINUTES = _SETTINGS["notification"]["duplicate_suppress_window_minutes"]


def _is_closed_date(d) -> bool:
    """土日・日本の祝日（jpholiday未インストール時は土日のみ）なら True を返す"""
    try:
        import jpholiday
        return d.weekday() >= 5 or jpholiday.is_holiday(d)
    except ImportError:
        return d.weekday() >= 5


def last_business_day() -> str:
    """土日・日本の祝日を除いた直近営業日を YYYY-MM-DD で返す"""
    from datetime import date, timedelta

    d = date.today() - timedelta(days=1)  # 当日データは通常未確定なので前日から開始
    while _is_closed_date(d):
        d -= timedelta(days=1)
    return str(d)


# 日本株の通常取引時間（前場・後場、昼休みは無視した大枠の判定用）。
# LINE Webhook受信時に5分足監視をその場で起動するかどうかの判定にのみ使う
# （デイトレ判定ロジック自体の OPENING_RANGE / MONITORING_TIME_LIMIT とは無関係）。
MARKET_OPEN_TIME = _time(9, 0)
MARKET_CLOSE_TIME = _time(15, 30)


def is_market_open_now() -> bool:
    """現在が日本株の取引時間内（平日・祝日を除く 09:00〜15:30）かどうかを返す"""
    from datetime import datetime

    now = datetime.now()
    if _is_closed_date(now.date()):
        return False
    return MARKET_OPEN_TIME <= now.time() <= MARKET_CLOSE_TIME


def is_trading_day(d=None) -> bool:
    """指定日（省略時は本日）が取引日（平日・日本の祝日を除く）かどうかを返す"""
    from datetime import date as _date

    return not _is_closed_date(d or _date.today())


def get_market_status() -> str:
    """
    現在の取引状態を返す（GUI表示・LINE Webhookの応答分岐に使う）。

    - "CLOSED_DAY": 本日は取引日ではない（土日・祝日）
    - "WAITING":    取引日だが取引時間前（09:00より前）
    - "OPEN":       取引時間内（09:00〜15:30）
    - "ENDED":      取引日で本日の取引時間は終了済み（15:30より後）
    """
    from datetime import datetime

    now = datetime.now()
    if _is_closed_date(now.date()):
        return "CLOSED_DAY"
    t = now.time()
    if t < MARKET_OPEN_TIME:
        return "WAITING"
    if t > MARKET_CLOSE_TIME:
        return "ENDED"
    return "OPEN"

# yfinance で取得する市場指数・為替
MARKET_SYMBOLS = {
    "^N225":    "日経平均",
    "1306.T":   "TOPIX連動ETF",  # ^TOPX は yfinance で取得不可のため代替シンボルを使用
    "^IXIC":    "NASDAQ",
    "^GSPC":    "S&P500",
    "USDJPY=X": "ドル円",
    "BTC-USD":  "ビットコイン",
}

# 分析フィルター条件
MIN_PRICE = 10            # 最低終値（円）
MAX_PRICE = 200000        # 最高終値（円）
MIN_PRICE_CHANGE_PCT = 3.0  # 最低前日比（%）
MIN_VOLUME_RATIO = 2.0    # 出来高/5日平均の最低倍率
MIN_TURNOVER = 50_000_000   # 最低売買代金（5000万円）
