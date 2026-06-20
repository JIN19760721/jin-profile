@echo off
REM Launches the Streamlit GUI for stock_ai.
REM Opens a browser window at http://localhost:8501 automatically.

setlocal

cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

streamlit run app.py

endlocal
