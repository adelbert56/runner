# AI-Ready 任務卡：TRAINING-REPORT-COACH-001

## Metadata

- 任務：實作 C 版單堂主課逐段教練判讀
- 上層規格：`ai/artifacts/單堂主課教練判讀升級/feature-spec.md`
- 上層 Epic：單堂主課教練判讀升級
- 上層 User Story：US-1、US-2、US-3、US-4
- 分軌：前端
- 前置任務（dependsOn）：無（`tools/kanban/epics.json` 尚未建立治理卡）
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall／2026-09-02，定版 C 實作

## 目標

在現有單堂 Garmin 報告的教練判讀區，按前／中／後段呈現實際配速、心率、步頻與變化，並保留課表對照、資料品質、比較信心與不自動調速的保護。

## 情境包（Context Pack）

- 相關檔案：`site/trainer-render.js` 的 `renderLatestTrainingReport()`／`sessionQualitySignals()`；`site/trainer.css` 的 `.session-coach-callout`；`scripts/trainer-logic-check.mjs`、`scripts/ui-smoke-check.mjs`。
- 既有模式：Garmin 明確 MAIN／ACTIVE／INTERVAL 步驟才可做主課判讀；`postRunVerdict()` 負責正式課表完成度與下一步；比較樣本來自 `coachReviewData.autopilot.metrics`。
- 假設：既有 `run.laps` 有距離、時間、配速，心率／步頻可能缺失。
- 未知事項：實作後以實際訓練頁確認現場資料的各種步驟標籤。
- 允許變更的檔案：上述四個檔案與本 Epic artifact。
- 不得觸碰：Garmin fetch、課表演算法、活動指派、歷史資料、資料同步。

## 需求

- 連續分成最多三段，依 Garmin 主課步驟的順序顯示客觀數據與相對變化。
- 缺心率或步頻時顯示「未提供」，不填 0、不下相應結論。
- 比較樣本不足或主課範圍不存在時，以明確限制降級。
- 僅改報告呈現；不得改寫課表或觸發自動調速。

## 驗收標準

- 對六段主課顯示前／中／後三段，並可讀出後段相對前段的配速與心率變化。
- 同時有「課表對照」「資料限制」「下一步」；不以單趟快慢要求進階。
- MAIN、ACTIVE、INTERVAL 三種有效主課標籤皆可得到正確序列；無主課／不足兩段則明確降級。
- 桌面與 390px 寬度下不溢出，判讀結構維持單欄閱讀。

## 實作備註

- 新 helper 只組成顯示模型；數據採距離／時間加權，避免直接平均各圈配速。
- 沿用現有 Card、證據列與 `--c-*` token；不新增設計元件。

## 驗證契約

- 單元測試：新增主課逐段模型的 MAIN／ACTIVE／缺值案例。
- 整合測試：`node scripts/trainer-logic-check.mjs`、`node scripts/ui-smoke-check.mjs`。
- 型別檢查：`node --check site/trainer-render.js`。
- 螢幕截圖：桌面與 390px；若本工作區工具不可用，記錄為殘留缺口。
- 安全性檢查：確認無新增 API、儲存或個資傳送。
