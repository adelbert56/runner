# 驗證報告

## 摘要

- 任務：賽事與內容資訊密度優化 A。
- 結果：部分通過（本次功能通過；全域 Trainer layout 檢查有既有失敗）。
- 驗證者：Codex。

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `npm run content:publish` | 通過 | 重新產生 120 筆內容。 |
| `npm run content:quality:strict` | 通過 | 跑鞋 60、新聞 60、0 項品質問題。 |
| `npm run check` | 通過 | 包含前端、內容、賽事資料與既有 smoke checks。 |
| `npm run ui:layout` | 失敗 | `mobile/trainer-direct-coach-schedule` 的 week 3→4 教練處方斷言失敗；非本次賽事／內容頁範圍。 |
| 非跑步內容掃描 + `git diff --check` | 通過 | 指定籃球鞋關鍵字 0 筆，且無 whitespace error。 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 桌面版 | `output/playwright/race-content-desktop.png` | 賽事完整事實、報名與收藏操作均存在。 |
| 行動裝置 390px | `output/playwright/race-content-390-collapsed.png` | 完整事實預設收合，Playwright DOM 確認主導覽與主要動作可達。 |
| 行動裝置 390px | `output/playwright/content-decision-mobile.png` | 跑鞋卡顯示「跑鞋定位」決策摘要。 |

## 審查發現

| 發現 | 嚴重程度 | 狀態 |
|---|---|---|
| 已取得的完整欄位撐長賽事卡 | P1 | 已改為預設收合，仍可展開。 |
| 籃球鞋內容可由舊庫存回填 | P1 | 發布與驗證規則均新增籃球鞋訊號與跑步脈絡要求。 |
| 手機版主導覽可用寬度不足 | P2 | 560px 以下隱藏品牌文字並保留橫向導覽。 |
| Trainer 全域 layout 測試失敗 | P2（非本次） | 未修改，避免混入不相關課表邏輯。 |

## 殘留風險

- 賽事來源若把條款誤填進協辦欄，現在會如實顯示；資料清理屬爬蟲品質的獨立工作。
- 本次尚未 commit 或 push，因此 GitHub Pages 尚未反映本機修改。
