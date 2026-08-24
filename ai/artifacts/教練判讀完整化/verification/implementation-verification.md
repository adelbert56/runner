# 教練判讀完整化：驗證紀錄

日期：2026-08-24

## 已驗證

- `pytest tests/test_garmin_activity_segments.py`：6 passed；包含 250m 上／下坡、配速、HR、步頻摘要與無座標測試。
- `node scripts/build-training-review.mjs`：已重建加密訓練摘要。
- `node scripts/trainer-logic-check.mjs`：通過既有週期、賽事與配速護欄回歸。
- `npm run check`：通過 JavaScript 語法、UI smoke、資料與自動化檢查；新增 A 版放行判讀的靜態契約。
- `UI_LAYOUT_VIEWPORTS=mobile,laptop node scripts/ui-layout-check.mjs`：完成 mobile/laptop 版面掃描（訓練報告與註冊頁均通過）。
- `git diff --check`：通過。
- `node scripts/trainer-logic-check.mjs`：教練節奏處方會選取節奏跑陪伴；真恢復跑維持恢復陪伴；步頻以有效主課／分圈距離加權。
- `UI_LAYOUT_VIEWPORTS=mobile node scripts/ui-layout-check.mjs`：訓練頁及相鄰頁面手機版布局通過。

## 已知限制

- 現有歷史 Garmin 活動尚沒有詳細圖表摘要；下次執行 Garmin 同步並加 `--refresh-segments` 後才會逐筆補齊。資料缺失時 UI 明確降級為總爬升判讀，不推測坡度。
- 天氣預報僅供當日條件檢查；活動後的實測溫度以 Garmin 回傳值為準。
