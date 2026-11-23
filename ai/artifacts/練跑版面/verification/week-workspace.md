# 練跑版面 B 驗證

本機已實作。正式部署與真實帳號驗收待執行。

## 驗證結果

| 項目 | 結果 |
| --- | --- |
| `$env:UI_LAYOUT_BROWSER_CHANNEL='chrome'; npm.cmd test` | 通過靜態檢查、六種 Chrome 視窗及訓練邏輯。已核對單一七天週曆、鍵盤選日、320px 無頁面橫向溢出、管理選單開關、Garmin 實跑進入指定報告及分圈切換。 |
| W20 隔離瀏覽器情境 | 390 與 1440px 驗證 11/18 休息、下一堂、6.5 km 全程實跑與 25 km 主課處方分開，以及 12 km 長跑內容及未解鎖時的資料提示。使用合成資料，畫面中的課程放行狀態也屬測試情境。待放行提示前移後再跑完整回歸。 |
| `npm.cmd run build` | 通過。 |
| `npm.cmd run check` | 練跑檢查通過。工作目錄的賽事資料庫和網站中啟用賽事不一致，整體指令回傳失敗。未將賽事資料更新混入本案。 |
| `git diff --check` | 通過。 |

## 視覺與操作

- 截圖：`output/playwright/mobile-trainer-week-workspace.png`、`output/playwright/desktop-trainer-week-workspace.png`。以測試資料檢查版面、閱讀順序與選中日期的對比。
- 依現有設計系統重用週曆、課程詳情、Button、Card 及原生展開區塊。週進度側欄使用既有 `--c-surface`、`--c-border`、`--c-primary-hover`、`--c-text-muted`。
- 計畫暫停與安全提醒在課表前，待放行提示在所選課程的內容前。未解鎖時保留可用課表，並明確標示 Garmin 狀態。
- 週評估保留所有原有欄位。教練建議保留實跑證據、歷史、配對與排課入口。Garmin 紀錄提供單趟報告，趨勢分析保留半馬估計、週月跑量及判讀依據。

## 執行狀態

- 本機 `runner/訓練/週報.json` 的 W20 為 25 km，三堂處方為 6、7、12 km。同週 Garmin 建立回執為 11/17、11/19、11/21 三堂。未重新寫入 Garmin 或讀取真實帳號做驗收。
- 依授權由隔離工作區發布 `e1d54e03f014c62a9ea8bf3230ee79caeba754ce`，只提交練跑介面、同步程式與對應測試。[GitHub Pages 部署](https://github.com/adelbert56/runner/actions/runs/44302211748)成功。
- 正式發布工作區的 `npm.cmd test`、`npm.cmd run check`、`npm.cmd run build` 及最終樣式的 `npm.cmd run ui:layout` 均通過。核對正式網址回傳的六份有版本參數的資源，內容均與發布提交相同。
- 以隔離 Chrome 在正式站載入測試資料，驗證 390 px 與 1440 px 的七天選擇、選日後只展開對應課程、無橫向溢出及管理中的同步登入入口。截圖為 `output/garmin-history-deploy/output/playwright/production-trainer-390.png` 和 `production-trainer-1440.png`。
- 正式加密週報與發布提交一致，解密確認仍有 234 筆活動、11/17 實跑 6.5 km 和 W20 三堂共 25 km。真實帳號雙裝置流程待驗收。
