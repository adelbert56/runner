# 第一輪系統盤點與驗收報告

盤點日期：2026-07-19（Asia/Taipei）  
方式：只盤點與驗證；未進行大規模重構、未刪除資料、未修改真實報名紀錄。

## 一、系統摘要

- **用途**：臺灣中部路跑資訊公開站，加上本機限定的隊員／報名／繳費管理，以及個人 Garmin 訓練同步。
- **技術棧**：Static HTML/CSS/JavaScript、Node.js 本機 HTTP server、Python 3.11 crawler／Garmin scripts、`uv`、GitHub Actions、GitHub Pages、JSON/Markdown 檔案資料。
- **主要模組**：公開賽事／內容站（`site/`）、練跑計畫（`site/trainer*`）、本機報名管理（`local/registration/`）、賽事爬蟲（`scripts/platforms/`）、Garmin（`scripts/garmin/`）、資料品質與自動化（`scripts/*.mjs`）。
- **資料庫**：無獨立 DBMS；公開資料位於 `site/data/*.json`，私有報名資料位於 `runner/報名管理/報名管理資料.json`，訓練與 Garmin 資料位於 `runner/訓練/`。
- **驗證方式**：本機 host/origin 檢查、Garmin 活動同步加上 remote address 檢查；詳細風險見 `master-issue-list.md`。
- **部署方式**：GitHub Pages；排程 workflow 自行產資料、提交，再觸發 Pages。

## 二、目前可執行狀態

| 項目 | 結果 | 證據／限制 |
| --- | --- | --- |
| Node 依賴安裝 | PASS WITH CONDITION | `npm ci` 成功；`npm audit --omit=dev` 尚有 2 個 moderate 相依性項目。 |
| Python 依賴與測試 | PASS | `uv sync --group dev`、`uv run pytest -q`：20 passed。 |
| JavaScript 基線 | PASS | `npm run check` 成功。 |
| UI layout | PASS | `npm run ui:layout` 成功，涵蓋 mobile/tablet/desktop 與公開站頁面。 |
| 本機報名工作台 | PASS WITH CONDITION | 真實瀏覽器檢查主要讀取、分頁、表單與遮罩；未做會寫入真實資料的 CRUD。 |
| 本機 API 權限 | FAIL | 跨 Origin 已實測 403，但 server 綁定位址與 Host-only 授權留下 LAN 邊界風險（SEC-001）。 |
| Garmin 雲端同步 | PASS | run `29668370454` 完整成功，且 Pages deploy 成功。 |
| 線上排程／CI | FAIL | main 尚未包含本機修正；weather/content/CI 的最新已完成 run 仍失敗。 |

## 三、權限與資料流摘要

```text
公開 GitHub Pages ──讀取──> site/data/*.json
本機報名工作台 ──讀寫──> /api/registration-data ──> runner/報名管理/*.json
本機 trainer ──活動同步──> /api/garmin-activity-sync ──> PowerShell/Python ──> Garmin
公開 trainer 頁 ──課表橋接──> /api/garmin-workout-sync ──> 本機 Python ──> Garmin
GitHub Actions ──產生／提交──> site/data + runner reports ──> GitHub Pages
```

資料流的公開→本機 Garmin 課表橋接以及報名資料 API 的 LAN 邊界，均需列為 P1 安全工作，不應只以 UI 不顯示連結作為權限保護。2026-07-19 已依 Product Owner 決策保留 Garmin 橋接，並加入本機配對碼；報名 API 的 LAN 邊界仍待處理。

## 四、排程與部署實際紀錄

| Workflow | 最近驗證結果 | 結論 |
| --- | --- | --- |
| Sync Garmin training data `29668370454` | 成功；包含 fetch、加密報告、commit、Pages wait。 | PASS |
| Deploy static site `29668384165` | 成功。 | PASS |
| Refresh race weather `29668402665` | 失敗：`ERR_MODULE_NOT_FOUND: exceljs`。 | FAIL |
| Collect content candidates `29668403229` | 失敗：相同 `exceljs` 缺失。 | FAIL |
| CI `29664765013` | 失敗：等待不存在的 `[data-panel-link="training"]` 逾時。 | FAIL |
| Automation orchestrator `29668396464` | 成功啟動下游流程，但無法補救下游程式失敗。 | PASS WITH CONDITION |
| Schedule audit `29653584183` | 正確偵測並回報 6 個失敗檢查。 | PASS WITH CONDITION |

原因不是新的線上程式問題：工作區已有 `npm ci` 與 layout 修正，但尚未進入 GitHub `main`。在未受控 commit/push 前，不能宣稱排程恢復。

## 五、前端與本機報名管理 UI／UX

實測路徑：`/local/registration/registration.html`。

- **PASS**：頁面可讀取私有資料；待辦、隊員、人員篩選、報名工作區、目前賽事／歷史紀錄分頁均可切換。
- **PASS**：聯絡電話與身分證在列表中遮罩；可見本機儲存位置提示。
- **PASS**：報名建立區可多選隊員，並在未帶入賽事時停用距離選擇，避免無效組合。
- **NOT TESTED**：新增、編輯、刪除、Excel 匯入套用、備份還原、跨分頁 stale-write。這些會改寫真實私有資料；需以隔離測試資料執行。
- **NOT TESTED**：報名管理在手機／平板的實際互動。公開站 responsive 測試已通過，但尚未以真實瀏覽器逐一操作本機私有工作台。

## 六、資料品質待辦與根因

| 分級 | 現況 | 根因判定 | 處理方向 |
| --- | --- | --- | --- |
| 高 | 起跑時間 3 場可疑，其中 1 場高風險 | 平台頁面同距離多時段／分組名稱對應不完整 | 先官方核對，再補 parser 回歸樣本。 |
| 中 | 16 場待補、4 筆上線阻塞待補 | 遠期尚未開報、來源僅為聚合頁、平台尚未提供完整欄位 | 依 `tracking.status` 排程，而非一律人工填補。 |
| 低 | 缺費用 6、名額 8、部分起跑時間 8 | 主辦尚未公布或頁面未結構化 | 以定期追蹤處理，不阻擋上線。 |

資料報告的基準資料為 55 場賽事：原始完整度 71%，上線可用完整度 93%，且目前「開報後待補」與「報名日期異常」皆為 0 場。這表示公開站沒有立即顯示已知不合理的報名日期，但不表示所有遠期資料已完整。

## 七、問題統計與最高優先事項

完整清單與可測量驗收條件見 [Master Issue List](master-issue-list.md)。

| 風險 | 數量 |
| --- | ---: |
| P0 | 0 |
| P1 | 4 |
| P2 | 3 |
| P3 | 1 |

優先處理順序：SEC-001 → DEV-001／TEST-001 發布驗證 → DATA-001 → DATA-002 → TEST-002 → DEP-001。SEC-002 已依 Product Owner 決策完成本機配對碼保護。

## 八、需要 Product Owner 決策

1. 已決策：公開 GitHub Pages 保留跨來源操作本機 Garmin 課表同步，並已加入本機配對授權。
2. 本機報名管理是否只允許本機 loopback 使用？建議是；若需要 LAN 協作，需改為真正的帳號／權限模型，而非 Host 標頭判斷。
3. 是否授權將既有 workflow／CI／測試修正 commit 並 push 至 `main`，以完成線上排程的實際回歸驗證？
