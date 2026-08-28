# AI-Ready 任務卡

## Metadata

- 任務：教練專業決策模型核心規則
- 上層規格：`ai/artifacts/教練專業決策模型/feature-spec.md`
- 上層 Epic：教練專業決策模型
- 上層 User Story：長跑指令、當日決策、進階門檻、壓力預算
- 分軌：前後端串接
- 前置任務（dependsOn）：無
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：使用者（2026-08-28 回覆「開始」）

## 目標

讓課表、週檢核與 Garmin 結構課程共用可稽核的強度護欄：長跑上限不被當成目標，資料不足不自動進階，且同一週最多保留兩個壓力事件。

## 情境包（Context Pack）

- 相關檔案：`site/trainer-plan.js`、`site/trainer-safety.js`、`site/trainer-actions.js`、`scripts/trainer-logic-check.mjs`
- 既有模式：`buildDayCard` 產生網站與 Garmin 共用的課程結構；`weeklyCoachPromotionEvidence` 彙整 Garmin 與 RPE；`coachPromotionGate` 決定是否放行。
- 假設：現有週檢核的恢復題目與備註為隔天恢復／談話測試的人工輸入來源；缺失一律是證據不足，不推論成傷病。
- 未知事項：Garmin 雲端已排程課的替換回條只在實際發布時產生，本任務不主動覆蓋既有遠端課表。
- 允許變更的檔案：上述四個檔案與本 Epic 的驗證證據。
- 不得觸碰：既有 Garmin 雲端課表、加密歷史週報、已完成活動紀錄。

## 需求

- 長跑處方顯示 130–155 bpm，155 明確為上限；超限或疲勞時唯一降級為跑走／縮短，不要求補量或收快。
- 品質課放行必須同時有結構化主課、RPE、隔天恢復與無症狀／步態異常證據；任一不足時維持或下修。
- 週內壓力事件（品質課、長跑品質段、賽事）最多兩個；超出時後續事件改為恢復跑並保留原因。
- 移除任何以特定部位為預設的安全文案，改為一般症狀與步態描述。

## 驗收標準

- 長跑課卡與 Garmin 結構目標均出現 `HR 130–155` 與「155 是上限」的行為說明。
- 缺 RPE、談話測試失敗、隔天恢復未確認或症狀／步態異常時，`coachPromotionGate` 不得回傳 `pass`。
- 三個壓力事件的週課表會把第三個轉為恢復跑，且不與長跑／品質課相鄰堆疊。
- `scripts/trainer-logic-check.mjs` 覆蓋上述護欄並全數通過。

## 實作備註

- 不改版面與視覺元件；只補既有卡片／週檢核的資料語意與文字，因此不新增 UI mockup。
- 不將高溫期直接切換為配速主導；品質課仍由既有季節邏輯在合適時機開放。

## 驗證契約

- 單元測試：`node scripts/trainer-logic-check.mjs`
- 整合測試：`node scripts/ui-smoke-check.mjs`
- E2E 測試：不執行遠端 Garmin 發布（本任務無遠端課表修改）。
- 型別檢查：不適用（純瀏覽器 JavaScript）。
- Lint：`git diff --check`
- Build：`node scripts/build-training-review.mjs --help`（確認週報建置入口可載入）
- 螢幕截圖：不新增或重排 UI；由現有 smoke 檢查覆蓋輸出字串。
- 安全性檢查：確認資料缺失只停留在「證據不足」，不擴大健康資料處理範圍。

## 完成證據

- 變更的檔案：`site/trainer-plan.js`、`site/trainer-safety.js`、`site/trainer-actions.js`、`site/trainer.js`、`site/trainer-render.js`、`scripts/trainer-logic-check.mjs`、`site/data/training-review.enc.json`。
- 執行過的指令：`node scripts/trainer-logic-check.mjs`、`node scripts/ui-smoke-check.mjs`、`node scripts/build-training-review.mjs --help`、`git diff --check`。
- 測試輸出：上述邏輯與 UI smoke 全數通過；週報加密輸出成功寫入。
- 螢幕截圖：不適用（無版面變更）。
- 已知限制：談話測試由週檢核明確確認，不自動從 Garmin 推斷。
- 後續任務：遠端 Garmin 發布時驗證 `replaced` 回條與 request 差異。
