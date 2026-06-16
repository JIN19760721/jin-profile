@echo off
REM Runs the 5-min intraday trade-decision check once.
REM The 5-minute repeat interval is handled by Windows Task Scheduler,
REM not by this script (no long-running / resident process here).

setlocal

cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set TODAY=%%i
set LOGFILE=logs\intraday_bat_%TODAY%.log

echo ==== %date% %time% ==== >> "%LOGFILE%"
python main.py --intraday --codes 7203 3778 --entry-mode manual --notify-line >> "%LOGFILE%" 2>&1

endlocal
