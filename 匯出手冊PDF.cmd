@echo off
setlocal
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE=C:\Users\Squall\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NODE_PATH=C:\Users\Squall\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\Squall\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules"
set "EXPORT_SCRIPT=%SCRIPT_DIR%scripts\export-handbook-pdf.cjs"

if not exist "%NODE_EXE%" (
  echo 找不到 Node 執行環境：%NODE_EXE%
  pause
  exit /b 1
)

if not exist "%EXPORT_SCRIPT%" (
  echo 找不到匯出腳本：%EXPORT_SCRIPT%
  pause
  exit /b 1
)

echo 正在匯出手冊 PDF...
"%NODE_EXE%" "%EXPORT_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo 匯出失敗。
  pause
  exit /b %EXIT_CODE%
)

echo.
echo 匯出完成。
pause
