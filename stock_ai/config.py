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

# LINE Messaging API（デイトレ判定のシグナル変化通知用）
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
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

MONITORING_TIME_LIMIT = _parse_hhmm(_SETTINGS["monitoring"]["time_limit"])

DUPLICATE_SUPPRESS_WINDOW_MINUTES = _SETTINGS["notification"]["duplicate_suppress_window_minutes"]


def last_business_day() -> str:
    """土日・日本の祝日を除いた直近営業日を YYYY-MM-DD で返す"""
    from datetime import date, timedelta

    try:
        import jpholiday
        def _is_closed(d: date) -> bool:
            return d.weekday() >= 5 or jpholiday.is_holiday(d)
    except ImportError:
        def _is_closed(d: date) -> bool:
            return d.weekday() >= 5  # jpholiday 未インストール時は土日のみ

    d = date.today() - timedelta(days=1)  # 当日データは通常未確定なので前日から開始
    while _is_closed(d):
        d -= timedelta(days=1)
    return str(d)

# yfinance で取得する市場指数・為替
MARKET_SYMBOLS = {
    "^N225":    "日経平均",
    "^TOPX":    "TOPIX",
    "^IXIC":    "NASDAQ",
    "^GSPC":    "S&P500",
    "USDJPY=X": "ドル円",
    "BTC-USD":  "ビットコイン",
}

# 分析フィルター条件
MIN_PRICE = 50            # 最低終値（円）
MAX_PRICE = 3000          # 最高終値（円）
MIN_PRICE_CHANGE_PCT = 3.0  # 最低前日比（%）
MIN_VOLUME_RATIO = 2.0    # 出来高/5日平均の最低倍率
MIN_TURNOVER = 50_000_000   # 最低売買代金（5000万円）
