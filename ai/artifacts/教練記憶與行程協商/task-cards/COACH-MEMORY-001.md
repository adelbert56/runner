# AI-Ready 任務卡

## Metadata

- 任務：建立事件驅動的教練記憶與未來課程行程協商
- 上層規格：`feature-spec.md`、`screen-spec-教練記憶.md`
- 上層 Epic：教練記憶與行程協商
- 上層 User Story：跑者能理解改課原因並安全處理臨時行程
- 分軌：前端
- 前置任務（dependsOn）：mockup A 已核准
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall

## 目標

在不增加日常輸入的前提下，讓未來課表的安全異動可被協商且完整追溯。

## 情境包（Context Pack）

- 相關檔案：`site/trainer-actions.js`、`site/trainer-render.js`、`site/trainer.css`、`site/trainer-data.js`、三個 Trainer 檢查腳本。
- 既有模式：`scheduleMakeupRun()`、`markMissed()`、`saveData()`、`renderCoachEvidencePanel()`、歷史週凍結判斷。
- 假設：教練記憶保存在既有本地 `appData`，且只附加新事件。
- 未知事項：無。
- 允許變更的檔案：上述檔案、測試、此 Epic 產出物與 design-system inventory。
- 不得觸碰：Garmin API、已完成課程、歷史週快照、正式課表的既有安全閘門。

## 需求

- 新增 append-only `coachMemory`，並以單一 helper 寫入。
- 限制協商入口只作用於未來、未完成的跑課。
- 每次協商只產生一個安全安排或一筆不補跑紀錄。
- 教練頁顯示最近三筆不重複記憶。

## 驗收標準

- 沒有每日問卷與跑後新增必填項。
- 任何協商不會寫入歷史週、今天或已完成課程。
- 教練記憶可在重新載入後保留。
- mobile、tablet、desktop 檢查通過。

## 實作備註

- 沿用現有補跑縮短 20% 與強度間隔規則；不得新增第二套排程器。

## 驗證契約

- 單元測試：`npm run trainer:logic`
- 整合測試：`npm run ui:check`
- E2E 測試：`npm run ui:layout`
- 型別檢查：`npm run check`
- 螢幕截圖：Playwright mobile、desktop trainer coach。
- 安全性檢查：`git diff --check`

## 完成證據

- 變更的檔案：`site/trainer.js`、`site/trainer-actions.js`、`site/trainer-render.js`、`site/trainer.css`、`site/trainer.html` 與 Trainer 檢查腳本。
- 執行過的指令：`npm run ui:check`、`npm run trainer:logic`、`npm run ui:layout`、`npm run check`、`git diff --check`。
- 測試輸出：全部通過。
- 螢幕截圖：`output/playwright/mobile-trainer-coach-decision.png`、`output/playwright/desktop-trainer-coach-decision.png`。
- 已知限制：既有歷史事件不回填成新教練記憶；從本次之後的有效改課與行程協商開始記錄。
- 後續任務：無。
