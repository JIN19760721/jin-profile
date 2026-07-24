@echo off
chcp 65001 > nul
cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

set PYTHONUTF8=1

echo.
echo ============================================================
echo  kabu Auto Trader
echo ============================================================
echo.
echo  1. Dry-run mode  (simulate only, no real orders)
echo  2. Live mode     (REAL orders will be placed)
echo.
set /p MODE="Select mode [1 or 2, default: 1]: "
if "%MODE%"=="" set MODE=1

echo.
echo  (Exchange filter is fixed by settings.yaml -^> trade.exchange, not selectable here)

echo.
if "%MODE%"=="2" (
    echo [WARNING] Live mode selected. Real orders will be placed.
    set /p CONFIRM="Type YES to confirm: "
    if not "%CONFIRM%"=="YES" (
        echo Cancelled.
        pause
        exit /b 0
    )
    echo.
    echo Starting live trading...
    python -m src.main --trade
) else (
    echo Starting dry-run...
    python -m src.main --trade --dry-run
)

echo.
pause
