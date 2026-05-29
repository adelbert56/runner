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
| `data-refresh.yml` | 每日 06:07、12:07、18:07、00:07 | 主流程：抓賽事 + 建所有 JSON |
| `message-cloud-refresh.yml` | 每日 12:07、18:07 | 更新 Issue #34 留言板資料 |
| `weather-refresh.yml` | 每日 06:07、18:07 | 更新天氣資料 |
| `runner-quips-refresh.yml` | 每日 00:07 | 更新跑者碎念語錄 |
| `content-candidates.yml` | 每日排程 | 收集內容候選 |
| `schedule-audit.yml` | 每日 00:20 | 健康檢查，失敗開 Issue |
| `workflow-run-monitor.yml` | workflow_run 觸發 | 監控其他 workflow 執行結果 |
| `ci.yml` | PR / push | 驗證、lint |
| `pages.yml` | push to main | 部署 GitHub Pages |

**並發保護**：所有排程 workflow 已設 `concurrency: cancel-in-progress: false`。
**commit 方式**：`.github/scripts/commit-generated.sh` 用 snapshot → hard-reset → re-apply → push（不用 rebase，避免並發衝突）。

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

## 未完成事項

- [ ] Issue #35「Refresh race data failure」→ root cause 已修，需手動關閉
- [ ] 所有 workflow 沒有 `on: failure` 通知機制（只有 schedule-audit 會開 Issue）
- [ ] Python scrapers (`scrapers/`) 已寫但需確認是否真的在 CI 跑

---

## 問我問題的省 token 技巧

| 情境 | 最省的問法 |
|------|----------|
| 不知道哪裡壞了 | 「幫我做健檢」→ 我用 investigator subagent（壓縮 60%）|
| 特定功能壞了 | 「XX 功能壞了，症狀是 YYY」 |
| 改特定檔案 | 「改 app.js 的 loadXxx 函數，讓它...」 |
| 不要讓我讀大檔 | 直接說「不要讀全檔，只查 XXX」 |
