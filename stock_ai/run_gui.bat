@echo off
REM Launches the Streamlit GUI for stock_ai, together with an ngrok tunnel
REM for the LINE Webhook (Flask, line_webhook.py) server on port 5000.
REM Opens a browser window at http://localhost:8501 automatically.

setlocal

cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

if exist "ngrok.exe" (
    start "ngrok-5000" .\ngrok.exe http 5000
) else (
    echo [WARNING] ngrok.exe not found. Skipping ngrok tunnel, needed for LINE Webhook.
)

streamlit run app.py

endlocal
