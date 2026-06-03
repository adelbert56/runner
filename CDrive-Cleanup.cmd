@echo off
setlocal

set "ROOT=%~dp0"
set "MENU=%ROOT%scripts\Clean-CDrive-Menu.ps1"

if not exist "%MENU%" (
  echo [ERROR] Missing menu script:
  echo "%MENU%"
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%MENU%"
endlocal
