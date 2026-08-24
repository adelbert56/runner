# AI-Ready 任務卡

## Metadata

- 任務：以近期週量、實跑與恢復訊號調整跨月課表，避免把日曆切換誤當成加量理由。
- 上層 Epic：曆月跑量守門
- 分軌：前後端串接
- 前置任務（dependsOn）：無
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：使用者（2026-08-24）

## 目標

將 W8 週四輕鬆跑由 7 km 下修為 5 km；8/31 進入降載週且禁止跨月補量。週期的提升以完成度、品質課反應與恢復訊號共同決定。

## 情境包（Context Pack）

- 相關檔案：`runner/訓練/週報.json`、`runner/訓練/教練目標.{md,json}`、`site/trainer-actions.js`、`site/trainer.js`。
- 既有模式：加密週報是正式菜單來源；Garmin 實跑會同步進本機課表。
- 允許變更的檔案：上述檔案與邏輯回歸測試。
- 不得觸碰：已完成 Garmin 課程、長跑與品質課的自動距離。

## 需求

- W8 週四下修為 5 km；週二出口檢測、週六長跑維持。
- 8/31 只做降載週既定恢復跑，不補八月里程。

## 驗收標準

- W8 預估週量為 33.95 km，且不回寫已完成 Garmin 跑步。
- 九月課表不會因跨月而自動增加長跑或品質課。

## 驗證契約

- 單元測試：`npm run trainer:logic`
- 整合測試：`npm run ui:check`
- 語法檢查：`npm run check`
- UI 螢幕截圖：不適用；本次不改畫面結構或樣式。

## 完成證據

- 變更的檔案：`runner/訓練/週報.json`、`runner/訓練/教練目標.{md,json}`、`site/data/training-review.enc.json`。
- 執行過的指令：`node scripts/build-training-review.mjs`、`npm run trainer:logic`、`npm run check`。
- 測試輸出：全部通過；發布器成功寫入加密週報。
- 已知限制：課表頁是每個瀏覽器的 localStorage；重新整理並解鎖週報後會讀到更新後的 W8 正式菜單。
