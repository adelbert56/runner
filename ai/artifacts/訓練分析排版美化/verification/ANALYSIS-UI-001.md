# ANALYSIS-UI-001 驗證

- node --check site/trainer-render.js：通過。
- npm run trainer:logic：通過（邏輯、生命週期、放行）。
- node scripts/ui-smoke-check.mjs：通過。
- UI_LAYOUT_PORT=4188 UI_LAYOUT_VIEWPORTS=desktop,mobile UI_LAYOUT_BROWSER_CHANNEL=msedge UI_LAYOUT_TRAINER_ONLY=1 node scripts/ui-layout-check.mjs：exit0，兩尺寸訓練及報名hero通過，新增摘要/圖表/明細順序、5欄scope、數值對齊與聚焦捲動斷言。
- 截圖：output/playwright/mobile-trainer-analysis-a.png、desktop-trainer-analysis-a.png。截圖來自既有測試資料，非使用者最新Garmin資料。擷取區塊時僅暫時隱藏固定導覽以免拼接遮蓋，不改執行頁面樣式。已人工檢視手機，桌面前次檢視後修正空資料圖表拉伸與截圖導覽遮蓋。

## 審查
已檢查活動名稱/日期/配速escape、缺值—、未捏造課型/RPE、無新增資料請求與寫入、既有月/週及進階資料保留。重用既有圖表與Card/Nav/Table，無新增核心元件。核准建議：本機可驗收。

## 限制
正式站未發布；未使用真實手錶寫入。原有配速彙整口徑未在本次視覺任務變更。首次誤用不存在ui:smoke命令，改直接執行既有script成功。
