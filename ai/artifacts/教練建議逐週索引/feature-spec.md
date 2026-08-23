# 功能規格書

## Metadata

- 功能：教練建議 tab 加逐週決策索引
- 負責人：Squall
- 狀態：已實作；2026-08-23 由 Squall 核准（含 mockup 變體 A）
- 風險等級：低（僅新增查詢/導覽介面，不改寫既有教練決策、排課或 Garmin 資料流程）

## 問題

「教練建議」tab（`renderCoachReviewPanel` / `renderCoachDecisionWorkspace`，`site/trainer-render.js`）目前只用時間序列出：
- 最近 8 則教練分析筆記（`coachReviewData.history` + `appData.garminAnalysisHistory` 去重後 `slice(0, 8)`，只帶 `date` 不帶週次）
- 最近 4 次排課變更摘要

使用者若想確認「第 N 週教練當時決定了什麼、為什麼」，只能用日期去對照，沒有以週次為單位的查詢入口。品質檢測（2026-08-23）已將此列為明確 UX 缺口。

「本週課表」tab 的歷史週已有 `renderHistoricalCourseDecisionPanel()`（`trainer-render.js:791`）可完整重播某一歷史週的課程／完成紀錄快照，但入口只在課表本身的週次導覽裡，不在教練建議 tab。

## 使用者

- 已累積多週紀錄、想回顧某一週教練判讀依據的跑者（例如賽前檢討、調整信任度）。
- 對照「這週表現不如預期」時，想確認是否為教練當時已知風險並主動調整過的跑者。

## 目標

- 教練建議 tab 提供「依週次」瀏覽歷史教練筆記與排課變更的入口，不必只靠日期記憶去找。
- 索引可以連到既有的「本週課表」歷史週回顧面板（`renderHistoricalCourseDecisionPanel`），避免重造一份判讀邏輯。
- 沒有教練筆記/排課變更的週次要清楚顯示「當週沒有留下記錄」，不得假造內容。

## 非目標

- 不新增教練筆記的编輯、刪除或補寫功能——索引只讀取既有資料。
- 不改變教練筆記/排課變更資料的儲存結構（`coachReviewData.history`、`appData.garminAnalysisHistory`、排課變更紀錄）。
- 不取代或重寫「本週課表」既有的 `renderHistoricalCourseDecisionPanel`；索引是導覽入口，不是第二套判讀邏輯。
- 不處理跨訓練週期（多個 `appData.plan` 週期）的索引彙整——目前僅索引當前週期內的週次。

## 使用者故事（User Stories）

| 故事 | 身為／我想要／以便 | 驗收標準 |
|---|---|---|
| 逐週查找 | 身為跑者，我想在教練建議 tab 選一個週次，以便看到那一週教練留下的筆記與排課變更。 | 索引以週次排序（1…N），點選後顯示該週對應的教練筆記/排課變更；當週無記錄時顯示明確空狀態文字。 |
| 快速定位目前週 | 身為跑者，我想索引預設定位在目前週或最近有記錄的週，以便不用每次都從第 1 週找起。 | 索引預設展開/捲動至目前訓練週（`currentWeek`）或距今最近一筆有記錄的週次。 |
| 串接歷史課表 | 身為跑者，我想從索引直接跳到該週的課表回顧，以便對照教練判讀與實際排課結果。 | 索引項目提供連結／按鈕，可開啟該週對應的「本週課表」歷史週回顧面板（沿用 `renderHistoricalCourseDecisionPanel`）。 |

## 使用者旅程

```text
身為使用這套系統超過 4 週的跑者
我想在教練建議 tab 用週次而不是日期去找某週的教練判讀
以便確認當週狀況是否已被教練預見並處理過
```

## 功能需求

- WHEN 使用者開啟教練建議 tab 且已有至少 1 筆歷史教練筆記或排課變更，THE SYSTEM SHALL 顯示依週次排序的索引清單。
- WHEN 某週次沒有對應的教練筆記或排課變更，THE SYSTEM SHALL 在索引中標示該週為「無記錄」而非省略或留白。
- WHEN 使用者點選索引中的某一週，THE SYSTEM SHALL 顯示該週的教練筆記與排課變更摘要（沿用既有 `renderCoachHistoryItem` 呈現邏輯）。
- WHEN 使用者從索引點選「查看該週課表」，THE SYSTEM SHALL 導向對應週次的「本週課表」歷史回顧（`renderHistoricalCourseDecisionPanel`），不得重複實作判讀規則。
- WHEN 目前週期尚無任何歷史記錄（新使用者、第 1 週），THE SYSTEM SHALL 隱藏索引或顯示「累積紀錄後才會出現」的說明，不得顯示空索引框架造成混淆。

## 畫面

| 畫面 | 狀態 | 備註 |
|---|---|---|
| 教練建議 tab — 逐週索引 | 預設（有記錄）、空狀態（尚無記錄）、選中某週、行動裝置版 | 索引本身為新增區塊，插入 `renderCoachReviewPanel` 既有結構內；不影響上方教練決策摘要卡。 |

## 資料與 API

- 輸入：既有 `coachReviewData.history`、`appData.garminAnalysisHistory`（教練筆記，含 `date`）、既有排課變更紀錄來源（沿用目前「最近 4 次排課變更」讀取的同一份資料）、`appData.plan[].weekNum` / `days[].dateStr`（用於日期→週次對應）。
- 輸出：僅前端渲染，不新增後端 API、不新增 localStorage 欄位。
- 驗證：日期→週次對應須用現有 `appData.plan` 週次區間比對，不得自行假設週長度（呼應 `docs/superpowers/plans/2026-07-19-trainer-refactor.md` 提到的「課表寫入單一權威」原則——此功能是唯讀，不受影響但要延用同一套週次定義）。
- 錯誤：找不到對應週次資料時（如筆記日期早於目前 `appData.plan` 涵蓋範圍），該筆記歸類為「週期外記錄」獨立顯示，不得指派到錯誤週次。

## 安全性與隱私

- 身分驗證：無（沿用現有無登入的本機資料模型）。
- 權限：無新增。
- 敏感資料：教練筆記內容維持既有儲存位置與存取範圍，不新增匯出或分享路徑。
- 濫用情境：不適用（純本機讀取渲染）。

## 驗收標準

- 教練建議 tab 新增逐週索引，索引週次與「本週課表」的週次定義一致（同一份 `appData.plan`）。
- 有記錄的週可一鍵查看筆記/排課變更摘要，並可跳轉至對應歷史課表回顧。
- 無記錄的週明確標示，不產生誤導。
- 不改動既有教練決策摘要卡、排課邏輯、Garmin 同步或歷史課表回顧的既有行為（回歸驗證：`npm run trainer:logic`、`npm run ui:smoke` 全綠）。
- 手機版索引可正常捲動/展開，不破版。

## 驗證計畫

- 單元／靜態：`node --check site/trainer-render.js`。
- 整合：`npm run trainer:logic`（週次/歷史判讀不回歸）、`npm run ui:smoke`（新增至少 1 則索引相關斷言）。
- 視覺：`npm run ui:layout` 桌面與行動裝置寬度；教練建議 tab 截圖比對索引呈現。
- 手動：以現有測試資料（多週教練筆記）操作索引點選、空狀態、跳轉歷史課表三種路徑。
