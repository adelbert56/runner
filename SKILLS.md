# Runner Plaza Agent Skill

本文件是跑者廣場的專案級第二大腦。後續代理人接手時，先讀這份，再依任務讀 README、資料更新 SOP、UI 商品化驗收標準與各報告。

## 專案定位

- 目標是中部跑者內部團體可用的公告與查詢系統，不是大型會員平台。
- 目前以 GitHub Pages 靜態站為主，重點是手機查閱、官方報名直連、行事曆、收藏與練跑菜單。
- 優先讓跑者少踩坑：賽事是否報名中、是否停辦、地點、主辦、費用、名額與資料最後查證時間要清楚。

## 主要架構

- 前端：`site/` 靜態頁，資料讀 `site/data/races.json`。
- 公開網站：`https://adelbert56.github.io/runner/`，不要再使用舊的 `adelbert56.github.io` 網址。
- 賽事資料源：`runner/赛事/赛事数据库.json`。
- 跑鞋 / 新聞資料源：`runner/内容/候选内容.json`，發布到 `site/data/content.json`。
- 主爬蟲：`scripts/main.py`。
- 官方平台補資料：`scripts/enrich_platforms.py` 與 `scripts/platforms/`。
- 資料同步與報告：`npm run data:refresh`、`npm run data:quality`。
- 自動排程：`.github/workflows/data-refresh.yml` 每週二、四 18:00 Asia/Taipei 更新賽事；`.github/workflows/content-candidates.yml` 每週一 09:00 Asia/Taipei 更新跑鞋 / 新聞。
- 發布：`.github/workflows/pages.yml`，推送 `main` 後部署 GitHub Pages。

## 資料原則

- 官方報名網站優先，避免把需要登入的中介頁當成主要入口。
- 人工補充資料優先權最高，平台爬蟲只補空欄位或低信心欄位。
- 平台解析要保守：沒抓準就寫入待補或報告，不要用泛用文字硬塞主辦、費用、名額。
- 每筆重要賽事盡量保留 `verified_at`、`source_platform`、`is_official_direct`、`verification_note` 與缺漏欄位。
- 已開報但還缺地點、主辦、費用、名額時，要進「開報後待補資料」報告，因為這通常代表爬蟲規則不足。
- 停辦、報名中、即將截止、已截止、賽事已過期都要用狀態與顏色分清楚。
- 過期超過一個月的賽事收進歷史；近期過期可以留在清單但視覺弱化。

## 平台補強策略

- iRunner、Lohas、CTRun、JoinNow、Focusline、bao-ming、EventGo 都應走平台 adapter。
- 新增平台欄位時先做小範圍驗證，再納入定期流程。
- 若使用者指出報名頁上明明有資料，優先修該平台 parser，不要只人工補單筆。
- 報告要講清楚「抓不到」「解析不到」「尚未開報」「官方頁未公布」的差異。

## UI 原則

- 使用者已多次強調「UI 風格一致性」與「系統商品化」。這是硬性需求，不是可選優化；任何 UI 任務都要先讀 `runner/系统配置/UI商品化验收标准.md`。
- 手機優先。賽事、跑鞋、練跑、新聞四個分頁不可造成橫向溢出。
- 做完前端修改後，用瀏覽器手機 viewport 實測，不只看桌面。
- UI 修改要優先維護設計系統，而不是針對單張截圖補丁。先統一 token、卡片、控制列、按鈕與間距，再處理單頁例外。
- 若同類元件看起來不一致，先重整共用 CSS 與 HTML 結構，不要再追加局部補丁。
- 卡片操作區要一致：主要 CTA、收藏星號、加入行事曆、用這場排課、詳情的位置與尺寸要固定。
- 跑鞋、新聞、入門內容卡片使用固定資訊層級：日期、類別、完整標題、摘要、來源、收藏。收藏固定右上角，分享與只看收藏固定在工具列操作區。
- 收藏以圖示呈現，減少卡片寬度壓力。
- 導覽與篩選要 sticky 或可收合，避免使用者在手機長列表中迷路。
- 重要資訊先顯示：日期、地區、距離、報名狀態、官方入口；細節放展開區。

## 內容原則

- 跑鞋與新聞以繁體中文為主，需有日期、排序、筆數顯示 10/25/50、收藏功能。
- 跑鞋知識不能只像單鞋推薦，要整理成選鞋邏輯、使用情境、輪替策略、評測方法與換鞋時機。
- 新聞與跑鞋資料適合用 RSS/Search/Crawler 定期補候選清單，再人工篩選或保守入庫。
- `npm run content:refresh` 應同時重建候選報告、上架報告與 `site/data/content.json`；跑鞋、新聞數量不足時不要只改前端 fallback。

## 練跑菜單原則

- 菜單要依目標賽事日期自動算週數。
- 使用者可輸入目標距離、完賽時間或配速，兩者要連動換算。
- 表單應使用分段選擇或下拉，避免手機輸入時間格式錯誤。
- 生成內容要能依每週跑幾天、目前跑量、長跑能力、傷痛狀態、強度偏好調整。
- 個人教練分析先用本機規則：長跑占比、週跑量門檻、傷痛、疲勞、距離賽事天數與訓練頻率都要影響建議；避免假裝有真人教練或手錶授權。
- 鼓勵語要具體且可執行，例如完成率、降載、恢復與下一週調整，不寫空泛加油。
- Garmin 目前先做「建議摘要」與行事曆匯出；正式手錶同步需要帳號授權，不能假裝已串接。

## 驗證流程

- 一般修改：`npm run check`。
- Python 修改：`uv run python -m compileall scripts`。
- 資料流程修改：`uv run python scripts/enrich_platforms.py --dry-run` 後再跑 `npm run data:refresh`。
- 收尾驗證：`npm run data:refresh`、`npm run content:refresh`、`npm run ops:dashboard`、`npm run check`、`uv run python -m compileall scripts`。
- 營運狀態檢查：`npm run ops:dashboard`，看賽事完整度、官方直連率、開報後待補與內容候選量。
- UI 修改：啟動 `npm run dev`，依 `runner/系统配置/UI商品化验收标准.md` 用瀏覽器桌面與手機 viewport 截圖檢查。
- CSS/JS 有變動時，更新 `site/index.html` 的版本參數，避免 GitHub Pages 快取讓使用者看舊版。

## Git 與檔案規則

- 不提交 `.obsidian/workspace.json`，這類本機工作區狀態應留在 `.gitignore`。
- 空的 `server.out.log`、`server.err.log` 與 `scripts/**/__pycache__` 可以清理；`.venv` 是本機依賴環境，除非要重建環境，否則不要當一般整理項目刪除。
- 既有未提交的使用者變更不要順手 stage。
- 若只改文件，提交時只 stage 相關文件。
- 推送到 `main` 後確認 GitHub Pages 會由 workflow 自動部署。

## 自我迭代規則

- 每次修復告一段落後，更新這份 `SKILLS.md` 或 `runner/系统配置/第二大脑.md`。
- 要記錄的是可重複使用的判斷，不是流水帳。
- 若發現資料錯誤來自平台 parser，補 parser 規則與測試路徑。
- 若發現 UI 問題來自手機 viewport，補進手機驗證清單。
- 若使用者反覆指出同類問題，將它升級成固定驗證項目。
