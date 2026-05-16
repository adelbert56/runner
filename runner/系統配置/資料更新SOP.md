# 資料更新 SOP

## 自動排程

- GitHub Actions `Refresh race data` 每週二、四 18:00（Asia/Taipei）執行，也可手動執行。
- GitHub Actions `Collect content candidates` 每週一 09:00（Asia/Taipei）執行，也可手動執行。
- 流程會先跑賽事清單爬蟲，再跑官方平台補資料，最後產生品質報告。
- 每月追蹤賽事固定排在每月 1 號與 15 號檢查。

## 資料流程

1. `uv run python scripts/main.py`
   - 從主資料源更新中部賽事清單。
2. `uv run python scripts/enrich_platforms.py`
   - 依報名網址自動分派到 iRunner、Lohas、bao-ming、EventGo、Focusline、CTRun、JoinNow 解析器。
   - 優先補開報時間、截止時間、地點、主辦、費用、名額、狀態與查證時間。
3. `npm run data:refresh`
   - 套用人工補充。
   - 同步 `runner/賽事/賽事資料庫.json` 到 `site/data/races.json`。
   - 重產資料品質、追蹤計畫與開報後待補報告。

## 內容流程

1. `npm run content:candidates`
   - 收集跑鞋新品、跑步新聞與訓練文章候選資料。
2. `npm run content:publish`
   - 將候選內容整理成 `site/data/content.json`。
   - 更新 `runner/內容/自動上架內容報告.md`。
3. `npm run content:refresh`
   - 一次執行候選收集與發布，適合本機收尾與 GitHub Actions。

## 人工待補原則

- 只有平台爬蟲抓不到或欄位仍缺時，才進人工待補清單。
- 人工查到的欄位寫入 `runner/賽事/人工補充.json`。
- 補完後執行 `npm run data:refresh`。

## 查證欄位

每筆賽事建議保留：

- `verified_at`：最後查證日期。
- `source_platform`：資料來源平台。
- `is_official_direct`：是否官方直連。
- `verification_note`：查證來源摘要。
- `registration_note`：特殊狀態，例如停辦、額滿、登入限制或日期差異。

## 發布檢查

1. 執行 `npm run check`。
2. 若有 Python 修改，執行 `uv run python -m compileall scripts`。
3. 推送到 `main` 後，GitHub Pages 會自動部署。
4. 若前端 CSS/JS 有修改，更新 `site/index.html` 的版本參數以避開瀏覽器快取。
5. 收尾前建議再跑 `npm run ops:dashboard`，確認賽事、內容與待補數據都有反映到營運儀表板。
