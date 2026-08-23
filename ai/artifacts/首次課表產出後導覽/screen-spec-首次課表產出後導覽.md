# 畫面規格

## Metadata

- 功能：首次產出課表後的四 tab 導覽
- 畫面：本週課表 tab — 四 tab 導覽卡
- 狀態：已實作（變體 A，2026-08-23 核准）

## 目的

讓首次產出課表的新使用者知道四個 tab（本週課表／教練建議／週評估／進度與分析）各自的用途，避免只看第一個 tab、錯過教練判讀與趨勢分析。

## 版面配置

- 主要區域：`plan-tab-week` 區塊內，緊接在既有「新手三步上手卡」（`renderRunnerOnboardingCard`）之後。
- 次要區域：無。
- 導覽：無新增導覽，只說明既有四個 tab。
- 動作：關閉（本機記住不再顯示）。

## 狀態

| 狀態 | 必要行為 | 空狀態／錯誤文案 | 驗證方式 |
|---|---|---|---|
| 首次產出課表 | 顯示導覽卡 | — | 螢幕截圖 |
| 已看過/已關閉 | 不顯示 | — | ui-smoke 斷言 |
| 既有使用者（非首次） | 不顯示 | — | ui-smoke 斷言 |
| 行動裝置版 | 四格改為 2 欄（變體 A）或維持單欄堆疊（變體 B），文字不截斷 | — | `ui:layout` 手機寬度截圖 |

## 互動

| 動作 | 觸發條件 | 結果 | 失敗情境 |
|---|---|---|---|
| 關閉導覽卡 | 使用者點「知道了，關閉」 | 卡片關閉，本機記住不再顯示 | 本機儲存失敗時可能重複出現，但不阻擋任何 tab 瀏覽 |

## 設計系統對照

- 用到的既有 design token：`--radius-md`、`--c-text` / `--c-text-muted`。
- 用到的既有元件：`.runner-guide-card`（含 `.runner-guide-head` / `.runner-guide-kicker` / `.runner-guide-title` / `.runner-guide-copy` / `.runner-guide-list`）、`.btn` / `.btn-secondary`。
- 本畫面新做的元件：變體 A 的 `.tab-intro-grid` / `.tab-intro-item`（獨立四格卡片）；變體 B 的 `.tab-intro-inline` / `.tab-intro-row` / `.tab-intro-chip`（合併進既有卡片下半段的橫向 chip 列）。皆由既有 token 組成。待人工選定變體後，只將選定那一版登記回 `design-system.md` 元件庫 inventory。

## 視覺驗收標準

- 文字在手機版與桌面版都不會被截斷。
- 與既有三步上手卡不會同時顯示重疊的內容（用詞互補，不逐字重複）。
- 色彩、字體、間距、圓角一律取自既有 `trainer.css` token。
- 兩個變體皆已核對無 console 錯誤（本機靜態預覽驗證）。
