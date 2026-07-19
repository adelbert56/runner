# Master Issue List

盤點日期：2026-07-19（Asia/Taipei）  
範圍：本機 API／Garmin、GitHub Actions／Pages、報名管理 UI、賽事資料品質與測試覆蓋。

| ID | 類型 | 風險 | 問題與證據 | 影響範圍 | 建議方案 | 狀態 | 驗收標準 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | 資安／API | P1 | `site/server.mjs:113-127` 的報名資料授權只信任 `Host` 與可選的 `Origin`；未帶 Origin 時即放行。伺服器在 `:465` 未綁定 loopback。雖已驗證非本機 Origin 得 403，但 Host 標頭可由非瀏覽器客戶端偽造，存在 LAN 讀寫本機個資的風險。 | `runner/報名管理/報名管理資料.json`、報名匯入匯出 | 將伺服器綁定至 loopback，或於所有報名 API 同時驗證 `remoteAddress`；保留同源檢查。 | 待實作 | 從非 loopback 位址請求（含偽造 Host）一律 403；localhost GET／PUT／Excel 預覽仍正常。 |
| SEC-002 | 資安／架構 | P1 | `site/server.mjs:30-33,129-149,310-344` 允許公開 Pages 網域呼叫本機 Garmin 課表 API，且 POST 會啟動本機 PowerShell／Python 作業。此為有意的公開頁面→本機橋接，但沒有每台裝置配對或一次性授權。 | 本機 Garmin 課表發布 | 產品決策：保留橋接時加入本機配對 token／明確授權；不保留時移除公開 Origin。 | 待 PO 決策 | 未配對來源無法讀取狀態或啟動同步；已配對的公開訓練頁仍可完成同步。 |
| DEV-001 | DevOps | P1 | 線上 `Refresh race weather` run `29668402665` 與 `Collect content candidates` run `29668403229` 均在共享驗證缺少 `exceljs` 而失敗。工作區已補 `npm ci`，但尚未 commit/push，main 仍是舊版本。 | 天氣、內容、公告與自動資料發布 | 將已完成的 workflow 修正與 CI layout 修正以受控 commit 推送，再手動重跑三個流程。 | 待發布 | 三個 workflow 最新一次皆成功；產生檔案變更時 Pages 部署也成功。 |
| TEST-001 | 測試 | P1 | 線上 CI run `29664765013` 對不存在的 `[data-panel-link="training"]` 等待 30 秒後失敗；首頁已改以 `trainer.html` 連結。工作區已移除錯誤面板檢查，尚未發布。 | CI、UI 回歸檢查 | 發布既有 `scripts/ui-layout-check.mjs` 修正，讓首頁面板與獨立訓練頁分開驗證。 | 待發布 | GitHub CI 成功；六種 viewport 的首頁面板與 trainer 報表皆通過。 |
| DATA-001 | 資料品質 | P2 | `runner/賽事/起跑時間品質報告.md`：3 場起跑時間疑慮，含 1 場高風險（2026 國聚慵懶跑者聚樂部的 10K 同時出現 06:30、09:00）。 | 賽事卡、跑者行前資訊 | 以官方頁人工核對高風險資料，並為對應平台 parser 加回歸樣本。 | 待確認 | 官方頁、`races.json` 與前端顯示一致；品質報告不再列高風險項。 |
| DATA-002 | 資料品質／營運 | P2 | 55 場賽事中 16 場待補；原始完整度 71%，上線可用完整度 93%，其中 4 筆為上線阻塞待補。今天應重爬 2 場，另有 1 場等待開報日的官方報名連結。 | 賽事資料更新與公開資訊 | 依 `待補資料佇列.json` 的 `tracking.status` 先處理 `due_now` 與開報窗口，遠期資料只排程追蹤。 | 待追蹤 | 上線阻塞待補降為 0，或每筆均有官方查證／明確停辦證據。 |
| TEST-002 | 測試／資安 | P2 | 現有 `scripts/validate-registration-manager.mjs` 以原始碼規則檢查為主；沒有針對報名 API 的實際 LAN 邊界、偽造 Host、超大 payload、stale-write 的整合測試。 | 本機 API 退化防護 | 建立以暫存資料檔啟動 server 的 API 整合測試，覆蓋 403、400/413、409、422 與成功路徑。 | 待實作 | CI 自動執行 API 測試；每個權限與併發回應碼都有斷言。 |
| DEP-001 | 資安／相依性 | P3 | `npm audit --omit=dev`：`exceljs` 經 `uuid` 有 2 個 moderate 項目。npm 所提修正會改變 ExcelJS 主版本，不能直接自動套用。 | 本機 Excel 匯入匯出 | 先評估 ExcelJS 版本路線與實際 `uuid` 使用方式，再安排可回歸驗證的升降版。 | 待評估 | `npm audit --omit=dev` 無可接受範圍外的已知中高風險項，且 Excel 匯入匯出測試通過。 |

## 統計

| 風險 | 數量 |
| --- | ---: |
| P0 | 0 |
| P1 | 4 |
| P2 | 3 |
| P3 | 1 |

## 已驗證而非缺陷

- 本機 `GET /api/registration-data` 成功；相同請求帶 `Origin: https://example.com` 回傳 403。
- 本機 Garmin 活動同步狀態 API 回傳 200；非允許 Origin 對課表同步 API 回傳 403。
- Garmin GitHub workflow `29668370454` 已成功抓取活動、建立加密報告、提交資料與完成 Pages 部署。
- 本機報名管理以 Playwright 實測載入、待辦總覽、人員、報名工作區與遮罩聯絡資訊；未對真實報名資料執行新增、修改、刪除或還原等破壞性操作。
