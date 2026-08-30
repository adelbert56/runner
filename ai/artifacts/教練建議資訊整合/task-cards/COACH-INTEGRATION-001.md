# AI-ready 任務卡

## Metadata

- 任務：整合教練建議頁的重複資訊
- 上層規格：`screen-spec-教練建議.md`
- 上層 Epic：教練建議資訊整合
- 上層 User Story：跑者能先一眼讀懂本週判定與下一步，再按需追溯資料
- 分軌：前端
- 前置任務（dependsOn）：mockup A 已核准
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall

## 目標

將教練建議的本週決策、逐週回顧與資料訊號整合為單一資訊架構，避免相同判讀在長頁重複出現。

## 情境包（Context Pack）

- 相關檔案：`site/trainer-render.js`、`site/trainer.css`、`scripts/ui-layout-check.mjs`、`scripts/ui-smoke-check.mjs`。
- 既有模式：`renderCoachDecisionWorkspace()` 是本週判讀唯一 resolver；`renderCoachWeekIndex()` 和 `renderCheckinHistory()` 保存回顧；`renderCoachDataSignals()` 保存 Garmin 進階訊號。
- 假設：本週決策預設可見；長期歷程採按需切換。
- 未知事項：無；資料來源與行為維持現有契約。
- 允許變更的檔案：上述 render、CSS、測試與本 Epic 產出物。
- 不得觸碰：正式課表生成、Garmin API、歷史課表凍結及 localStorage 資料模型。

## 需求

- 第一屏只保留一次本週結論、下一步與 Garmin 關鍵依據。
- 逐週回顧與資料訊號可由可及的切換控制到達，預設不堆滿長頁。
- 不刪除課表變更、逐週評估、分析快照或未套用週報。
- 手機呈單欄、無水平溢位；鍵盤與 aria tab 語意可用。

## 驗收標準

- 不存在第二份本週決策／執行摘要。
- 三個資料群組可切換且只能顯示選定群組。
- 歷史週索引、變更紀錄與 Garmin 資訊仍可到達。
- Mobile、tablet、desktop layout 檢查通過。

## 驗證契約

- 單元測試：`npm run trainer:logic`
- 整合測試：`npm run ui:check`
- E2E 測試：`npm run ui:layout`
- 型別檢查：`npm run check`
- 螢幕截圖：Playwright mobile、desktop trainer coach screenshot
- 安全性檢查：`git diff --check`
