@echo off
setlocal

cd /d "%~dp0"

echo 正在根據 收款明細.xlsx 產生 SVG 與 Markdown...
call npm run payment:build
if errorlevel 1 (
  echo.
  echo 產生失敗，請檢查上方訊息。
  pause
  exit /b 1
)

echo.
echo 已完成：
echo - runner\賽事\收款明細.svg
echo - runner\賽事\收款明細.md
echo.
pause
