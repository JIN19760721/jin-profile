@echo off
REM Launches the Streamlit GUI for stock_ai, together with the LINE Webhook
REM (Flask, line_webhook.py) server on port 5000.
REM Opens a browser window at http://localhost:8501 automatically.

setlocal

cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

start "line_webhook-5000" python line_webhook.py

streamlit run app.py

endlocal
