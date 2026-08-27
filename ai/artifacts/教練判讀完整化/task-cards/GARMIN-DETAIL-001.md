# AI-Ready 任務卡

## Metadata

- 任務：Garmin 活動溫度與坡度細節回補
- 上層規格：`feature-spec.md`
- 分軌：前後端串接
- 前置任務（dependsOn）：`coach-decision-foundation.md`（完成）
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall（2026-08-27 授權優化兩項資料缺口）

## 目標

讓本機 Garmin 同步優先從詳細活動資料補齊活動溫度與 250m 坡度摘要；若 Garmin 未提供或本機舊快照沒有活動 ID，保留明確原因而非以空值或「待同步」誤導跑者。

## 情境包（Context Pack）

- 相關檔案：`scripts/garmin/fetch_garmin.py`、`scripts/build-training-review.mjs`、`site/trainer-render.js`、`tests/test_garmin_activity_segments.py`、`scripts/ui-smoke-check.mjs`。
- 既有模式：活動詳細資料只在本機轉為去識別化摘要；公開分析只保留最近活動的地形摘要，從不保存座標或原始秒級軌跡。
- 假設：Garmin 詳細端點可能在摘要沒有 `averageTemperature` 時提供溫度欄位或圖表序列。
- 未知事項：已缺活動 ID 的歷史快照無法由本機安全反查；下次可信同步才能重建連結。
- 允許變更的檔案：上述同步、轉譯、顯示與測試檔案，以及本任務卡／驗證報告。
- 不得觸碰：`runner/訓練/訓練紀錄.json`、任何 token、原始 GPS／經緯度、加密週報內容。

## 需求

- 活動摘要缺溫度時，以詳細活動／詳細圖表的明確溫度欄位補齊，並記錄安全的資料來源。
- 新活動與近期尚未完成詳細資料擷取的活動，可自動進行一次受限回補；已確認詳細端點不含資料者不重複高頻拉取。
- 坡度狀態須區分：已摘要、詳細資料無高度序列、詳細資料讀取失敗、缺活動 ID；UI 說明能否自動回補。
- 不保存 GPS 座標、polyline 或原始圖表列。

## 驗收標準

- `null` 溫度絕不渲染成 `null°C` 或 `0°C`。
- 詳細 payload 的平均溫度或溫度序列可產出 `avg_temperature_c`，並保留來源標籤。
- 詳細高度序列不足時，保存非敏感的失敗原因；有資料時仍產出既有 250m 坡度摘要。
- 正常同步不會無限重抓已確認無詳細資料的既有活動。
- 不含 route、latitude、longitude、polyline 欄位。

## 驗證契約

- 單元測試：`uv run pytest tests/test_garmin_activity_segments.py`
- 整合測試：以 fixtures 驗證活動轉譯與既有欄位保留；不呼叫 Garmin。
- UI：`npm run ui:check`、`UI_LAYOUT_PORT=4177 UI_LAYOUT_TRAINER_ONLY=1 UI_LAYOUT_VIEWPORTS=mobile,desktop npm run ui:layout`。
- 安全性檢查：`git diff --check`、搜尋輸出模型不含座標與 polyline。

## 完成證據

- 變更的檔案：`scripts/garmin/fetch_garmin.py`、`scripts/build-training-review.mjs`、`site/trainer-render.js`、`tests/test_garmin_activity_segments.py`、`scripts/ui-smoke-check.mjs`。
- 執行過的指令：`npm run garmin:sync`、`uv run pytest tests/test_garmin_activity_segments.py`、`npm run ui:check`、`npm run trainer:logic`、`npm run ui:layout`、`git diff --check`。
- 測試輸出：10 個 Garmin 摘要測試通過；同步成功完成 51 筆跑步活動與加密週報更新。
- 已知限制：2026-08-25 這筆活動的 Garmin 活動摘要與詳細端點均未回傳溫度欄位，系統會如實顯示缺少活動溫度；不以外部天氣資料偽裝為手錶量測。
