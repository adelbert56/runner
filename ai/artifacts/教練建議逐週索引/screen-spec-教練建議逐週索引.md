# 畫面規格

## Metadata

- 功能：教練建議 tab 加逐週決策索引
- 畫面：教練建議 tab — 逐週索引
- 狀態：已實作（變體 A，2026-08-23 核准）

## 目的

讓已累積多週紀錄的跑者，用「第 N 週」而不是日期去找教練當時的判讀依據與排課變更，並可一鍵跳到該週的正式課表歷史回顧。

## 版面配置

- 主要區域：既有 `renderCoachDecisionWorkspace`（教練決策摘要卡）維持不動，逐週索引插入在其下方、既有 `renderHistoryCoachContext()` 附近。
- 次要區域：索引選中週次後顯示的筆記/排課變更清單（沿用 `renderCoachHistoryItem` 呈現規則）。
- 導覽：週次索引本身（三個變體分別用下拉選單／橫向 chips／摺疊清單呈現）。
- 動作：「查看第 N 週課表回顧」按鈕，導向 `renderHistoricalCourseDecisionPanel`（本週課表 tab 的歷史週回顧）。

## 狀態

| 狀態 | 必要行為 | 空狀態／錯誤文案 | 驗證方式 |
|---|---|---|---|
| 預設（有記錄週） | 顯示該週教練筆記/排課變更列表 | — | 螢幕截圖 |
| 空狀態（無記錄週） | 索引可選但清單區顯示空狀態 | 「第 N 週沒有留下教練筆記或排課變更。」 | 螢幕截圖 |
| 尚無任何歷史（新使用者） | 整個索引區塊隱藏 | 不顯示空索引框架 | ui-smoke 斷言 |
| 本週（進行中） | 索引可選，顯示「本週進行中，尚未產生教練回顧紀錄」 | 同上 | 螢幕截圖 |
| 行動裝置版 | 下拉/chips/摺疊清單皆需可在 375px 寬度操作，chips 變體橫向捲動需可觸控滑動 | — | `ui:layout` 手機寬度截圖 |

## 互動

| 動作 | 觸發條件 | 結果 | 失敗情境 |
|---|---|---|---|
| 選擇週次 | 使用者在索引點選/選取某週 | 下方清單切換為該週資料 | 該週資料不存在時顯示空狀態，不報錯 |
| 查看課表回顧 | 點選「查看第 N 週課表回顧」 | 導向本週課表 tab 並定位到該週歷史回顧（`renderHistoricalCourseDecisionPanel`） | 若該週非歷史週（如未來週），隱藏此按鈕 |

## 設計系統對照

- 用到的既有 design token：`--radius` / `--radius-md` / `--radius-pill`、`--c-primary` / `--c-primary-hover` / `--c-tint-green`、`--c-surface` / `--c-surface2` / `--c-border`、`--c-text` / `--c-text-muted`。
- 用到的既有元件：`.card` / `.coach-panel`、`.coach-history` / `.coach-history-item` / `.coach-history-points`（教練筆記呈現，逐字沿用不重做）、`.checkin-week-switcher select`（變體 A 下拉樣式來源）、`.phase-tab` / `.progress-hub-tabs`（變體 B chips 樣式來源）、`.btn` / `.btn-secondary`。
- 本畫面新做的元件：三個變體各自的索引容器（`.week-index-select` 包裝、`.week-chip` 系列、`.week-accordion` 系列）——皆是既有 token 與既有元件視覺語言的組合排版，非全新視覺語言。待人工選定變體後，只將**選定那一版**的容器 class 登記回 `design-system.md` 元件庫 inventory（其餘兩版視為草稿，不登記）。

## 視覺驗收標準

- 文字在手機版與桌面版都不會被截斷。
- 主要動作（切換週次、查看課表回顧）清楚明確。
- 空狀態與「本週進行中」狀態明確呈現，不與「無記錄」混淆。
- 色彩、字體、間距、圓角、陰影一律取自既有 `trainer.css` token，沒有硬寫的一次性數值（本次三個變體皆已核對）。
- 重複使用元件庫既有元件（`.coach-history-item` 等）；新做的索引容器已依既有風格製作。
