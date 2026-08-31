# 畫面規格

## Metadata

- 功能：教練建議頁的決策優先資訊層級
- 畫面：Trainer／教練建議
- 狀態：已實作

## 目的

讓跑者先取得當週的可執行結論，再按需要查閱 Garmin 證據與教練紀錄。

## 版面配置

- 主要區域：本週教練判讀、決策結論、下一堂正式課表、查看課表動作。
- 次要區域：可展開的 Garmin 實跑判讀、教練記憶與完整依據。
- 導覽：沿用既有 Trainer 分頁與鍵盤行為。
- 動作：沿用「查看本週正式課表」。

## 狀態

| 狀態 | 必要行為 | 驗證方式 |
|---|---|---|
| 預設 | 先顯示結論與下一堂課 | desktop/mobile 截圖 |
| 載入中 | 沿用既有 Garmin 資料判讀中標示 | UI smoke |
| 空狀態 | 沿用「尚無可比較」的既有 Garmin 文案 | UI smoke |
| 錯誤 | 沿用同步健康提示，不把錯誤誤當訓練結論 | UI smoke |
| 停用 | 沿用既有鎖定按鈕與課表狀態 | UI smoke |
| 權限不足 | 本次不新增權限面，沿用既有 Garmin 配對提示 | UI smoke |
| 行動裝置版 | 390px 單欄，主要動作不截斷 | mobile 截圖 |

## 設計系統對照

- 用到的既有 design token：`--c-primary`、`--c-primary-hover`、`--c-surface`、`--c-surface2`、`--c-text`、`--c-text-muted`、`--c-border`、`--radius-md`、`--radius-lg`。
- 用到的既有元件：card、secondary button、status pill、可展開 details、Trainer tab。
- 本畫面新做的元件：無；僅以既有 card/details 組件重排。

## 視覺驗收標準

- 主要結論、下一堂與主動作在 Garmin 證據之前。
- 桌面與手機文字不截斷，互動目標沿用既有最小高度。
