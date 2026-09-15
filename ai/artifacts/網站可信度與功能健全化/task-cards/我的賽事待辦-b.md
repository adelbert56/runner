# AI-Ready 任務卡

## Metadata

- 任務：重整我的賽事待辦為不重複的時間分組清單
- 上層規格：`screen-spec-我的賽事待辦.md`
- 上層 Epic：網站可信度與功能健全化
- 上層 User Story：公開賽事列表可快速辨識近期已報名賽事
- 分軌：前端
- 前置任務（dependsOn）：既有公開賽事列表已完成
- 狀態：完成
- 風險等級：低
- Agent owner：Codex
- 人工核准者：Squall（變體 B，2026-09-15）

## 目標

近期已報名賽事依 7 天內／30 天內分組，每場只出現一次，空分組不占版面。

## 情境包（Context Pack）

- 相關檔案：`site/app.js`、`site/styles.css`。
- 既有模式：`renderRaceTodo()`、`todoItemHtml()`、Card、日期塊與狀態 pill。
- 假設：30 天範圍與最多四場維持不變。
- 未知事項：無。
- 允許變更的檔案：`site/app.js`、`site/styles.css` 與本任務治理產出物。
- 不得觸碰：賽事 JSON、localStorage key、收藏／已報名切換、排課流程。

## 需求

- 移除獨立「優先清單」。
- 只渲染有賽事的時間分組。
- 收藏且已報名以列內「優先」文字標記。
- 降低巢狀卡片、邊框、漸層與粗體競爭。

## 驗收標準

- 三場範例只產生三個 `[data-race-todo]`。
- 7 天內一場、30 天內兩場；沒有「今天要處理」空區塊。
- 點選與鍵盤操作仍導向原賽事卡。
- 桌機與 390px 無水平溢出或文字截斷。

## 實作備註

- 重用既有 token 與元件，不新增資料欄位或視覺系統。

## 驗證契約

- 單元測試：不適用。
- 整合測試：`node scripts/ui-smoke-check.mjs`。
- E2E 測試：Playwright 實際載入、標記測試賽事、檢查唯一列與分組。
- 型別檢查：不適用。
- Lint：`node --check site/app.js`、`git diff --check`。
- Build：不適用於靜態頁局部修改。
- 螢幕截圖：桌機與 390px。
- 安全性檢查：確認未改 localStorage key 與 HTML escape。

## 完成證據

- 變更的檔案：`site/app.js`、`site/styles.css`、`scripts/ui-smoke-check.mjs` 與本 Epic 治理文件。
- 執行過的指令：`node --check site/app.js`、`node --check scripts/ui-smoke-check.mjs`、`node scripts/ui-smoke-check.mjs`、終端 Playwright、`git diff --check`。
- 測試輸出：smoke 全數通過；Playwright 桌機與 390px 均為三列、兩個非空分組，沒有水平溢出。
- 螢幕截圖：`output/playwright/my-races-todo-b-desktop.png`、`output/playwright/my-races-todo-b-mobile-390.png`。
- 已知限制：待辦仍維持既有最多四場與未來 30 天範圍。
- 後續任務：無。
