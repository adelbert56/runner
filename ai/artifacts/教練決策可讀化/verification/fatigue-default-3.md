# 驗證報告

## 摘要

- 任務：週評估與提前排課的疲勞值改為真正預設 3，並把歷史缺值顯示為 3/5。
- 結果：通過
- 驗證者：Codex

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `npm run check` | 通過 | 包含新增的預設值與歷史顯示 smoke assertion。 |
| `npm run ui:layout` | 通過 | Mobile、tablet portrait、tablet landscape 的 Trainer 版面檢查通過；提前排課流程未手填疲勞值仍寫入 3。 |
| `npm run trainer:logic` | 通過 | 訓練課表與 Garmin 語意回歸通過。 |
| `git diff --check` | 通過 | 無空白錯誤。 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 桌面版 | 未擷取 | 本機專案規則禁止使用 in-app Browser；以專案 Playwright 版面檢查驗證。 |
| 行動裝置版 | 自動版面檢查 | `npm run ui:layout` 通過 mobile、tablet portrait、tablet landscape。 |

## 審查發現

| 發現 | 嚴重程度 | 狀態 |
|---|---|---|
| 原本的 `placeholder="3"` 不會寫入輸入值，提交空欄時會儲存為 0。 | 中 | 已修正為 `value="3"`，提交端亦以 3 作後備值。 |
| 舊資料的 0／缺值會呈現為 `—/5`。 | 低 | 已統一在歷史清單與趨勢呈現為 3/5。 |

## 殘留風險

- 舊瀏覽器 localStorage 的原始缺值不會被主動覆寫；畫面與後續儲存皆採 3，避免無關的資料寫入。
