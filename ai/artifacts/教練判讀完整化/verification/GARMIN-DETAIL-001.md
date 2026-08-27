# 驗證報告

## 摘要

- 任務：Garmin 活動溫度與坡度細節回補
- 結果：通過（已知 Garmin 來源資料缺口如實保留）
- 驗證者：Codex

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `npm run garmin:sync` | 通過 | Garmin 讀取成功；51 筆跑步活動、53 天恢復訊號與加密週報刷新。 |
| `uv run pytest tests/test_garmin_activity_segments.py` | 通過 | 10 項；覆蓋詳細活動平均溫度、圖表溫度聚合、無 ID 與隱私邊界。 |
| `npm run ui:check` | 通過 | 包含溫度／坡度狀態不發布原始活動流的斷言。 |
| `npm run trainer:logic` | 通過 | 既有課表與完成判定未回歸。 |
| `UI_LAYOUT_PORT=4178 UI_LAYOUT_TRAINER_ONLY=1 UI_LAYOUT_VIEWPORTS=mobile,desktop npm run ui:layout` | 通過 | 桌機與行動版布局正常。 |
| `git diff --check` | 通過 | 無空白或衝突問題。 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 桌面版 | `output/playwright/desktop-trainer-report.png` | 重用 `coach-decision-card`，活動溫度缺失不再輸出 `null°C`。 |
| 行動裝置版 | `output/playwright/mobile-trainer-report.png` | 證據列維持單欄、長文字可換行。 |

## 審查發現

| 發現 | 嚴重程度 | 狀態 |
|---|---|---|
| Garmin 詳細端點不保證回傳活動溫度或高度序列 | 中 | 已降級處理並顯示來源狀態；不臆測數字。 |
| 舊快照可能缺活動 ID | 中 | 已保留多筆 legacy 紀錄且 UI 指向本機同步回補。 |

## 殘留風險

- 沒有 Garmin 回傳的裝置溫度時，Runner 不以外部氣象資料冒充活動量測；若需要實測環境溫度，仍取決於手錶／tempe 感測器是否有寫入 Garmin 活動。
