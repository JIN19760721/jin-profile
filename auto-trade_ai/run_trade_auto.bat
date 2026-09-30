@echo off
chcp 65001 > nul
cd /d "%~dp0"

if not exist "logs" mkdir logs

set LOG_DATE=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%
set LOG_FILE=logs\trade_%LOG_DATE%.log

set PYTHON=C:\Users\jinsa\AppData\Local\Programs\Python\Python313\python.exe
if exist ".venv\Scripts\python.exe" set PYTHON=%~dp0.venv\Scripts\python.exe

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo [%DATE% %TIME%] START >> "%LOG_FILE%"
echo [%DATE% %TIME%] PYTHON=%PYTHON% >> "%LOG_FILE%"

rem 取引所フィルタは settings.yaml の trade.exchange で指定する（--exchange は --trade では無視される）
if "%1"=="--live" (
    echo [%DATE% %TIME%] MODE=LIVE >> "%LOG_FILE%"
    "%PYTHON%" -m src.main --trade >> "%LOG_FILE%" 2>&1
) else (
    echo [%DATE% %TIME%] MODE=DRY-RUN >> "%LOG_FILE%"
    "%PYTHON%" -m src.main --trade --dry-run >> "%LOG_FILE%" 2>&1
)

echo [%DATE% %TIME%] END >> "%LOG_FILE%"
