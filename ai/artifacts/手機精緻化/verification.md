# 手機精緻化驗證與限制

- 使用者於 2026-11-17 選擇 A；手機訓練儀表板以 CSS 將既有「今日課表」置於本週清單之前，保留原有資料與按鈕。賽事、公告、跑鞋與新聞列表調整間距與層次；僅作用於 720px 以下。
- `npm run check`、`npm run trainer:logic`、`npm run build`、CSS 語法解析與 `git diff --check` 通過。本機服務 43130 的 `index.html`、`trainer.html`、`modern.css` 均回 HTTP 200，確認引用與樣式為本次版本。
- 靜態審查沿用設計系統色彩與既有元件，主要操作至少 44px；保留所有既有空狀態與資料流程。這不代表所有元件或全站符合設計清單，沒有實測對比度、截斷及所有互動。
- 專案禁止瀏覽器控制；沒有實際手機螢幕截圖、逐頁視覺、人眼驗收或滑動體驗證據。手機上的順序、長內容、觸控與真實資料仍待驗收，無法宣稱全站精緻化已完成。
- Mockup 關卡已補充互動選項工具的使用方式；本次已收到 A，未再要求選擇。
- 2026-11-17 使用者手機截圖回報週曆日期偏移與課程下方區塊擁擠。手機週日期容器改為明確單欄置中，課程天氣及提醒改以文字列分隔，待放行提示保留警示底色，操作按鈕至少 44px。`npm run check`、`npm run trainer:logic`、`npm run build`、CSS 語法、`git diff --check` 通過；本機 43131 的頁面與樣式均 HTTP 200。因專案禁止瀏覽器控制，尚無修改後手機截圖或人眼驗收，不能宣稱截圖中的問題已在手機上完全解決。
- 後續使用者明確允許瀏覽器查驗：在隔離 Chrome 執行 `UI_LAYOUT_VIEWPORTS=mobile UI_LAYOUT_TRAINER_ONLY=1 UI_LAYOUT_BROWSER_CHANNEL=chrome npm run ui:layout`。320／390／430px 週曆七個按鈕寬至少 44px、日期中心誤差不超過 1.5px，完成、跳過、待放行有可見文字及 aria-label；390px 測試確認管理按鈕容器未橫向溢出。截圖 `output/playwright/mobile-week-strip-audit.png`、`mobile-training-toolbar-audit.png`、`mobile-day-detail-audit.png` 已人工查看；使用合成資料，未驗證真實手機鍵盤及帳號。
- 上述日期與課程卡片調整仍屬本次未部署變更；提供的課程截圖沒有包含天氣與教練提醒兩者，該組合仍須以真實資料／手機驗收。
- 使用者再次明確允許瀏覽器查驗。隔離 Chrome 以 390px 檢查訓練、報名入口、賽事、公告、跑鞋、入門與新聞，頁面版面腳本通過；週曆另檢查 320／390／430px。管理按鈕調整至至少 44px 高並放大文字，新增以實際課程渲染函式產生的合成天氣與教練提醒同時出現畫面，截圖為 `output/playwright/mobile-weather-coach-audit.png`。測試不代表真實手機、所有資料狀態或實際登入均已驗收。
