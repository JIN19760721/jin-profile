@echo off
REM Generates the daily monitoring report once, after market close.
REM Intended to run once per day (e.g. 15:35) via Windows Task Scheduler.
REM This is independent of run_intraday.bat / the 5-minute intraday monitoring.

setlocal

cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set TODAY=%%i
set LOGFILE=logs\daily_report_bat_%TODAY%.log

echo ==== %date% %time% ==== >> "%LOGFILE%"
python main.py --daily-report >> "%LOGFILE%" 2>&1

endlocal
