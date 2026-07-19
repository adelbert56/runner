# 跑者廣場 — Claude 工作手冊

> **Token 守則**：先查本文件，再讀程式碼。本文覆蓋的知識不需要 `Read` 檔案。

---

## 專案一句話

靜態網站 + GitHub Actions 自動化。爬蟲抓賽事 → Node.js 腳本建 JSON → GitHub Pages 部署。
受眾：台灣中部跑者，小範圍朋友使用。

---

## 架構速覽

```
runner/賽事/賽事資料庫.json   ← Python scrapers 產出（scrapers/ 目錄）
        ↓
scripts/sync-race-data.mjs    → site/data/races.json
scripts/build-announcements.mjs → site/data/announcements.json
scripts/build-message-cloud.mjs → site/data/message-cloud.json  (留言板 + 文字雲)
scripts/build-automation-health.mjs → site/data/automation-health.json
scripts/build-operational-dashboard.mjs → site/data/operational-dashboard.json
scripts/update-race-weather.mjs → site/data/weather.json
scripts/refresh-runner-quips.mjs → site/data/runner-quips.json
        ↓
site/index.html + site/app.js + site/styles.css  ← 靜態前端
```

---

## GitHub Actions 工作流程表

| 檔案 | 觸發時間 (Asia/Taipei) | 功能 |
|------|----------------------|------|
| `data-refresh.yml` | **週二、週四**（UTC 10:17/11:47/13:17/15:47 四個備援時段，≈台北 18:17/19:47/21:17/23:47） | 主流程：抓賽事 + 建所有 JSON。**一週兩次，非每日**（GitHub 排程會延遲/掉，故同日多時段備援） |
| `message-cloud-refresh.yml` | 每日 12:07、18:07 | 更新 Issue #34 留言板資料 |
| `weather-refresh.yml` | 每日 07:23、08:37、11:07 | 更新天氣資料（前兩個為主備、第三個為補跑） |
| `runner-quips-refresh.yml` | 每週一 10:23、11:53、13:23 | 更新跑者碎念語錄 |
| `content-candidates.yml` | 週一、三、五 09:17、10:37、12:17、13:47 | 收集內容候選 |
| `automation-orchestrator.yml` | 每 30 分鐘 + 重要 workflow 完成後 | 補派發錯過的自動化任務 |
| `schedule-audit.yml` | 每日 00:20 | 健康檢查，失敗開 Issue |
| `workflow-run-monitor.yml` | workflow_run 觸發 | 監控其他 workflow 執行結果 |
| `ci.yml` | PR / push | 驗證、lint |
| `pages.yml` | push to main | 部署 GitHub Pages |

**並發保護**：所有排程 workflow 已設 `concurrency: cancel-in-progress: false`。
**commit 方式**：`.github/scripts/commit-generated.sh` 用 snapshot → hard-reset → re-apply → push（不用 rebase，避免並發衝突）。

---

## 本機工具（不進 CI）

| 工具 | 指令 | 說明 |
|------|------|------|
| 賽程收款明細表（主） | 直接編 `收款明細.xlsx` | **使用者主要用這個**：可編輯 Excel，內建公式（總金額/已收/未收自動算）、已付/已報名下拉、紅綠上色、賽事篩選。圖像＝Excel 截圖。產生器 `scripts/init-payment-xlsx.mjs`（`npm run payment:init`，**重跑會用 JSON 覆蓋 Excel，平常別跑**）。 |
| 賽程收款明細表（舊管線） | `npm run payment:build` | 目前**優先讀 `收款明細.xlsx`** 產 `.md`（Obsidian）/`.svg`；找不到 Excel 才退回 `收款明細.json`。腳本 `scripts/build-payment-sheet.mjs`。 |

收款檔（`收款明細.json/.md/.xlsx/.svg`）含真名金流，**全部 gitignore，只留本機**；只有 `收款明細.範例.json` 進 git。

---

## 已修復的已知問題（不需要重新調查）

| 日期 | 問題 | 修法 | Commit |
|------|------|------|--------|
| 2026-05-29 | data-refresh 並發 rebase 衝突 | hard-reset 取代 rebase | `8cb98e0` |
| 2026-05-29 | schedule-audit 把 in_progress 誤判 BAD | `okConclusion` 加 `in_progress` | PR #39/#40 |
| 2026-05-29 | message-list 留言板 RWD 跑版 | 修 CSS breakpoint (680px/520px) | `fa90d12` |
| 2026-05-30 | 3 個 script readFile 無 try/catch | 加 try/catch + fallback | `66054e5` |

---

## 前端關鍵資訊

- **`site/app.js`**：`DATA_VERSION = "20260529-message-list1"`；4 個 loadXxx() 用 `Promise.allSettled` 並行跑
- **`site/styles.css`**：`.message-list` 有 3-col → 2-col (≤680px) → 1-col (≤520px) grid
- **留言板**：GitHub Issue #34，`build-message-cloud.mjs` 每日兩次抓 comments，輸出 `messages[]`（文字雲）+ `comments[]`（留言列表）

---

## 腳本依賴關係（上游失敗時影響範圍）

```
races.json 不存在 → build-announcements.mjs 輸出空公告（有 fallback）
races.json 不存在 → sync-race-data.mjs 寫空 []（有 fallback）
site/index.html 不存在 → build-operational-dashboard.mjs 用 "" fallback
```

---

## 練跑計畫（trainer）模組結構（2026-07-19 拆檔後）

`site/trainer.js` 原 8162 行單檔已拆成 5 檔（classic script，全域共享，載入順序＝依賴順序，全部在 `trainer.js` 前載入）：

| 檔 | 行數 | 職責 |
|----|------|------|
| `trainer-copy.js` | ~198 | 面向使用者的文案、label、格式化 helper（secToPace、trainingTypeLabel、教練信句式…） |
| `trainer-plan.js` | ~1449 | 課表產生（buildPlan/buildPhases/buildWorkoutContent）、滾動校準、體能推估、週期 apply/restart |
| `trainer-render.js` | ~2838 | 所有 renderXxx／卡片／教練面板／週期時間軸／週日課卡／modal |
| `trainer-actions.js` | ~1238 | 課程動作、週評估、配速校準、調適、log、備份、週期管理、匯出 |
| `trainer.js` | ~2455 | 資料模型（normalizeData/loadData/saveData）、常數表、setup、pace/zone utils、init、事件接線 |

改動注意：函式名皆全域、被 59 個 inline `onclick` 引用，**不可改名**；載入順序改動要同步更新 `trainer.html`、`package.json` check、`ui-smoke-check.mjs` 串接清單、`?v=` 快取參數。詳見 `docs/superpowers/plans/2026-07-19-trainer-refactor.md`（含未執行的資料整合待確認清單 D1–D4）。

## 未完成事項

- [x] 練跑計畫資料整合：D1 發布檔 laps 瘦身、D2 心率區間單一真相（`hrZones` 優先教練明訂區間）、D3 `runner/訓練/教練目標.json`（機器可讀 zones+periodization，build 覆蓋週報值）皆已做並驗證；D4 Garmin 4 檔合併經評估**否決**（是跨行程 handshake 非碎片化，合併會競態）。細節見 plan 檔。心率區間／週期日後改 `教練目標.json`。
- [ ] Issue #35「Refresh race data failure」→ root cause 已修，需手動關閉
- [ ] `workflow-run-monitor.yml` 已涵蓋主要 workflow 失敗通報，但未做更細的分類或升級策略
- [ ] Python scrapers (`scrapers/`) 已寫但需確認是否真的在 CI 跑

---

## 問我問題的省 token 技巧

| 情境 | 最省的問法 |
|------|----------|
| 不知道哪裡壞了 | 「幫我做健檢」→ 我用 investigator subagent（壓縮 60%）|
| 特定功能壞了 | 「XX 功能壞了，症狀是 YYY」 |
| 改特定檔案 | 「改 app.js 的 loadXxx 函數，讓它...」 |
| 不要讓我讀大檔 | 直接說「不要讀全檔，只查 XXX」 |
