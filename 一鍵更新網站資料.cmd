@echo off
setlocal
cd /d "%~dp0"

echo [1/2] 重新整理跑鞋與新聞資料...
call npm run content:refresh
if errorlevel 1 goto :fail

echo [2/2] 發布到 GitHub Pages 並驗證公開網站...
call npm run site:publish
if errorlevel 1 goto :fail

echo.
echo 已完成：地端資料、GitHub main、GitHub Pages 公開站都已同步。
endlocal & exit /b 0

:fail
echo.
echo 更新失敗，請查看上方錯誤訊息。
endlocal & exit /b 1
