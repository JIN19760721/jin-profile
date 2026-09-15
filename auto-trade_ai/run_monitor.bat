@echo off
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"

echo ============================================================
echo   kabu リアルタイム株価予測モニター
echo   - ランキング Types 1,6,7 から最大 50 銘柄を選定
echo   - WebSocket でリアルタイム価格を受信
echo   - 8指標 + ENTRY_SCORE を計算して表示
echo   - 発注は行いません
echo   - 15:30 に自動停止
echo ============================================================
echo.

if not exist .venv\Scripts\activate (
    echo [ERROR] 仮想環境が見つかりません。先に python -m venv .venv を実行してください。
    pause
    exit /b 1
)

call .venv\Scripts\activate

echo [INFO] モニター起動中...
echo [INFO] Ctrl+C で停止できます。
echo.

python -m src.main --monitor

echo.
echo [INFO] モニターを終了しました。
pause
