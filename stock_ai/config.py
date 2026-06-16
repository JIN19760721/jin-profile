import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
EXCEL_DIR = BASE_DIR / "excel"
LOGS_DIR = BASE_DIR / "logs"
DB_PATH = DATA_DIR / "stocks.db"

for _d in [DATA_DIR, EXCEL_DIR, LOGS_DIR]:
    _d.mkdir(exist_ok=True)

load_dotenv(BASE_DIR / ".env")

JQUANTS_API_KEY = os.getenv("JQUANTS_API_KEY", "") or os.getenv("JQUANTS_REFRESH_TOKEN", "")

JQUANTS_BASE_URL = "https://api.jquants.com/v2"

# LINE Messaging API（デイトレ判定のシグナル変化通知用）
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_USER_ID = os.getenv("LINE_USER_ID", "")


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
