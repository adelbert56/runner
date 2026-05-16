# 資料更新 SOP

## 自動排程

- GitHub Actions `Refresh race data` 每週二、四 18:00（Asia/Taipei）執行，也可手動執行。
- GitHub Actions `Refresh race weather` 每天 07:00（Asia/Taipei）執行，只更新 7 天內賽事的當日預報。
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
4. `npm run data:quality:strict`
   - GitHub Actions 發布前品質閘門。
   - 若開報後仍缺核心欄位、報名日期異常，或起跑時間抓到非起跑時程等高風險問題，流程會失敗並停止提交。
5. `npm run data:weather`
   - 只處理距離賽事日 0 到 7 天內的賽事。
   - 依縣市座標查詢 Open-Meteo 當日預報，寫入 `weather_forecast`。
   - 前端只顯示符合賽事日期的預報，避免過早或過期天氣干擾。

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
  - 只能在 `registration_link` 指向非 `running.biji.co` 的官方/報名平台時視為 true。
  - 運動筆記詳情頁、會員報名紀錄頁或空連結都不能算官方直連。
- `verification_note`：查證來源摘要。
- `registration_note`：特殊狀態，例如停辦、額滿、登入限制或日期差異。
- `start_times`：各距離開跑時間；建議用物件，例如 `{ "21km": "06:00", "10km": "06:10" }`。
- `weather_forecast`：賽前 7 天內由排程寫入的天氣資料，不需人工維護。

## 發布檢查

1. 執行 `npm run check`。
2. 執行 `npm run data:quality:strict`，確認自動發布不會帶出高風險資料。
3. 若有 Python 修改，執行 `uv run python -m compileall scripts`。
4. 推送到 `main` 後，GitHub Pages 會自動部署。
5. 若前端 CSS/JS 有修改，更新 `site/index.html` 的版本參數以避開瀏覽器快取。
6. 收尾前建議再跑 `npm run ops:dashboard`，確認賽事、內容與待補數據都有反映到營運儀表板。
7. 上線判斷優先看「上線可用完整度、開報後待補、報名日期異常、內容品質」；原始資料完整度包含遠期尚未開報賽事，未達 80% 不一定代表不能上線。

## 本機沙盒與來源健康度

- Codex 本機沙盒可能擋外部 HTTP socket，導致內容來源或官方補資料顯示 `fetch failed`。
- 若本機沙盒失敗但授權網路執行或 GitHub Actions 成功，應把它視為環境限制，不要誤判成來源壞掉。
- `runner/內容/內容來源健康度報告.md` 的「穩定 / 可用需觀察 / 需補強」要以可連外環境的結果為準。
- 若 GitHub Actions 也連續失敗，再處理來源網址、Cloudflare、網站改版或 parser 規則。
