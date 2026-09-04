"""
--codes で指定された銘柄コードの検証・正規化を行う。

仕様:
  - 4桁の英数字のみ許可（数字4桁、または1桁目を含めアルファベットを含む新形式コードに対応。それ以外はスキップ）
  - 重複除外（先に出てきたものを優先）
  - 最大5銘柄まで（超過分は切り捨て）
"""

import logging
import re

logger = logging.getLogger(__name__)

MAX_CODES = 5

_CODE_RE = re.compile(r"^[0-9A-Z]{4}$")


def is_valid_code(code: str) -> bool:
    """4桁の英数字銘柄コードかどうかを判定する（大文字小文字は区別しない）"""
    return bool(_CODE_RE.match(code.upper()))


def parse_codes(raw_codes: list[str]) -> list[str]:
    """
    生のコードリストを検証・正規化して返す。
    不正なコードはログ出力してスキップし、5件を超える分は切り捨てる。
    """
    codes: list[str] = []

    for raw in raw_codes:
        code = raw.strip().upper()
        if not is_valid_code(code):
            logger.warning("銘柄コード %s: 4桁の英数字ではないためスキップ", raw)
            continue
        if code in codes:
            logger.warning("銘柄コード %s: 重複のためスキップ", code)
            continue
        codes.append(code)

    if len(codes) > MAX_CODES:
        logger.warning("銘柄コードが %d 件指定されましたが、最大 %d 件までに制限します", len(codes), MAX_CODES)
        codes = codes[:MAX_CODES]

    return codes
