@echo off
setlocal
cd /d "%~dp0"

if "%PORT%"=="" set PORT=4173
set URL=http://127.0.0.1:%PORT%/

echo Starting Runner Plaza dev server on %URL% ...
start "Runner Plaza Dev Server" cmd /k npm run dev

REM Give the server a moment to boot, then open the browser.
timeout /t 3 /nobreak >nul
start "" "%URL%"

endlocal
