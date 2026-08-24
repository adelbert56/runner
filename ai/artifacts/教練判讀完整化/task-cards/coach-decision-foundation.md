# AI-Ready 任務卡

## Metadata

- 任務：本機地形摘要與配速校正資料品質
- 上層規格：`feature-spec.md`
- 分軌：後端
- 前置任務（dependsOn）：無（既有專案骨架）
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall（2026-08-24 啟動）

## 目標

從 Garmin 詳細圖表本機產生 250m 坡度、配速、心率、步頻摘要，並排除坡度、高溫、降雨與室內條件的自動配速校正。

## 情境包（Context Pack）

- 相關檔案：`scripts/garmin/fetch_garmin.py`、`scripts/build-training-review.mjs`、`site/trainer-garmin-calibration.js`
- 既有模式：個資只寫入 gitignored `runner/訓練/訓練紀錄.json`，發布後資料保持精簡。
- 允許變更的檔案：上述檔案及對應測試。
- 不得觸碰：原始 GPS／經緯度、公開資料發布格式。

## 驗收標準

- 不保存座標、路線或原始每秒資料。
- 分段坡度 >= 5%、高溫／降雨／室內條件不能推進配速校正。
- 無 Garmin 詳細資料時保留原有總爬升降級判讀。

## 驗證契約

- 單元測試：`pytest tests/test_garmin_activity_segments.py`
- 整合測試：`node scripts/build-training-review.mjs`
- 安全性檢查：`git diff --check`，確認無 route coordinate 欄位。
