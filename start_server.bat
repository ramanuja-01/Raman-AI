@echo off
cd /d "%~dp0"
echo.
echo  ========================================
echo   RAMAN AI - Experiment No. 170
echo   Local Server Starting...
echo  ========================================
echo.
echo  Open your browser and go to:
echo  http://localhost:7170
echo.
echo  Press Ctrl+C to stop the server.
echo.
python -m http.server 7170
pause
