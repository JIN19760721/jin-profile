@echo off
chcp 65001 > nul
cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

set PYTHONUTF8=1

echo.
echo ============================================================
echo  kabu Candidate Screener
echo ============================================================
echo.
echo Exchange: ALL / T / TP / TS / TG
set /p EXCHANGE="Exchange [default: ALL]: "
if "%EXCHANGE%"=="" set EXCHANGE=ALL

set /p TOP="Top N [default: 30]: "
if "%TOP%"=="" set TOP=30

echo.
python -m src.main --exchange %EXCHANGE% --top %TOP%

echo.
pause
