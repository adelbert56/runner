@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 uv。請先安裝 uv 後重新執行此檔案。
  pause
  exit /b 1
)

echo 正在更新 Garmin 本機授權與活動資料...
echo 若 Garmin 要求登入，請依跳出的登入流程完成驗證。
uv run python scripts\garmin\fetch_garmin.py
if errorlevel 1 (
  echo.
  echo [未完成] Garmin 授權或連線仍有問題；請完成 Garmin Connect 登入後再雙擊一次。
  pause
  exit /b 1
)

echo.
echo [完成] Garmin 資料已更新。現在可回到 Runner 再按「同步 Garmin」。
pause
exit /b 0
