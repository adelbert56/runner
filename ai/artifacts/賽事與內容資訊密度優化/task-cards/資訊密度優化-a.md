# AI-Ready 任務卡

## Metadata

- 任務：將賽事、跑鞋、新聞頁依完整事實卡 A 實作。
- 上層規格：`screen-spec-賽事與內容頁.md`
- 上層 Epic：賽事與內容資訊密度優化。
- 上層 User Story：跑者可在列表完成初步決策。
- 分軌：前後端串接。
- 前置任務（dependsOn）：mockup A 已由 Squall 核准。
- 狀態：完成（全域 Trainer layout 檢查的既有失敗已記錄，未混入本次修復）。
- 風險等級：中（公開內容資料與既有 localStorage 互動不可回歸）。
- Agent owner：Codex。
- 人工核准者：Squall／2026-08-05。

## 目標

公開頁面不折疊已取得的賽事資訊；跑鞋與新聞卡標出可依資料支持的決策重點；非跑步內容不能通過發布閘門。

## 情境包（Context Pack）

- 相關檔案：`site/app.js`、`site/styles.css`、`scripts/publish-content.mjs`、`scripts/validate-content-data.mjs`、`site/data/content.json`。
- 既有模式：資料驅動 DOM、`site/styles.css` token、localStorage 收藏／已報名／排課。
- 假設：只有來源資料已有的賽事欄位才顯示；跑鞋不推測未提供的規格。
- 未知事項：來源頁未提供的費用、名額、開跑時間仍保持缺省，不編造。
- 允許變更的檔案：上述檔案與本 Epic artifacts、design-system。
- 不得觸碰：既有賽事報告的未提交變更、帳號／Garmin／部署設定。

## 需求

- 顯示地點、開跑、費用、名額、主辦、協辦、天氣與查證資訊（資料存在時）；完整事實預設收合。
- 保留所有既有賽事操作與行為。
- 將內容摘要標示為跑鞋定位或跑者重點。
- 內容發布與嚴格驗證均拒絕明確非跑步內容與缺少跑步脈絡的新聞。
- 560px 以下釋出品牌文字空間，避免主導覽最後一項被裁切。

## 驗收標準

- 賽事卡不含 `details.race-detail-panel`，可讀事實區存在。
- 現有 120 筆內容通過嚴格品質檢查，且不含 Giannis/Freak/KD/LeBron/Foamposite/G.T. Cut/S.T. Charge/D.O.N. Issue。
- `npm run check` 與 `npm run ui:layout` 通過。
- 本機桌面及 390px 畫面可看到完整事實區與可操作導覽。

## 驗證契約

- 單元測試：`node --check`、內容嚴格品質閘門。
- 整合測試：`npm run check`。
- E2E 測試：本機 Playwright 卡片與導覽互動。
- Lint：由 `npm run check` 的靜態檢查覆蓋。
- 螢幕截圖：桌面與 390px。

## 完成證據

- 變更的檔案：`site/app.js`、`site/styles.css`、內容發布／驗證腳本與本 Epic artifacts。
- 執行過的指令：`npm run content:publish`、`npm run content:quality:strict`、`npm run check`、`npm run ui:layout`、Playwright 瀏覽器驗證。
- 測試輸出：內容嚴格品質與 `npm run check` 通過；Trainer layout 既有失敗詳見 verification report。
- 螢幕截圖：`verification/資訊密度優化-a.md`。
- 已知限制：未 commit 或 push。
