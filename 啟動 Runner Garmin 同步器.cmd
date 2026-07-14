@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=4173"
set "URL=http://127.0.0.1:%PORT%/site/trainer.html"

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js。請先安裝 Node.js LTS 後重新執行此檔案。
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 npm。請重新安裝 Node.js LTS 後重新執行此檔案。
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port %PORT% -InformationLevel Quiet) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo 正在啟動 Runner Garmin 本機同步器...
  start "Runner Garmin 本機同步器" /D "%CD%" cmd.exe /d /k "cd /d ""%CD%"" ^&^& npm.cmd run dev"
)

set /a ATTEMPTS=0
:wait_for_server
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto server_ready
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 15 goto server_failed
timeout /t 1 /nobreak >nul
goto wait_for_server

:server_ready
start "" "%URL%"
echo 已啟動本機同步器，並開啟 Runner。
echo 請在本週課表按「同步 Garmin」；實際寫入前仍會要求你確認。
timeout /t 4 /nobreak >nul
exit /b 0

:server_failed
echo [錯誤] 本機同步器未在 15 秒內啟動。
echo 請查看「Runner Garmin 本機同步器」視窗中的錯誤訊息。
pause
exit /b 1
