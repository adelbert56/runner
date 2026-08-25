# Garmin 誤跳步驟補正驗證

## 摘要

- 任務：已完成時間型節奏段後，Garmin 誤將後續補跑標記為收操時，不可把整堂課錯判為部分完成。
- 結果：通過。
- 驗證者：Codex／2026-08-25。

## 驗收契約

- 僅在時間型品質段完成至少 90%，且全程跑量達既有 Garmin 完成門檻時補正。
- 需將報告標示為「已補正步驟標籤」與「正式課程已完成」。
- 品質配速與心率仍只採 Garmin 明確標記的節奏段；不得把誤標後段混入品質指標。
- 不完整的時間型品質段或未達跑量門檻不可被放行。

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `node --check site/trainer-render.js` | 通過 | 語法檢查。 |
| `npm run ui:check` | 通過 | 靜態契約含誤跳步驟規則。 |
| `npm run trainer:logic` | 通過 | 現有教練與課表結構邏輯無回歸。 |
| `UI_LAYOUT_VIEWPORTS=mobile,desktop; UI_LAYOUT_TRAINER_ONLY=1; npm run ui:layout` | 通過 | 實際頁面驗證完整品質段＋8.91 km 會補正；未完成樣本仍被拒絕。 |
| `git diff --check` | 通過 | 無空白錯誤。 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 桌面版 | `output/playwright/desktop-trainer-step-label-recovery.png` | 顯示已補正步驟標籤、正式課程已完成與完整課程 8.0 km。 |
| 行動版 | `output/playwright/mobile-trainer-step-label-recovery.png` | 同一狀態通過窄螢幕無水平溢位檢查。 |

## 設計系統對照

- 未新增畫面結構或 CSS；沿用既有教練判讀證據列與 `site/trainer.css` 的綠白卡片系統。
- 文案使用既有標題、摘要與度量卡層級，未新增色彩、字級、間距或元件。

## 殘留風險

- Garmin 原始活動步驟標籤無法回寫；系統僅在本機教練判讀中補正，並保留原始分段證據。
