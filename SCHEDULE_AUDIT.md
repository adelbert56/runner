# Schedule audit（排程自我稽核）

此 repo 的自動化以「定時跑資料抓取 + 部署 Pages」為主；為了避免排程漏跑、workflow 被停用、或某個工作長期失敗卻沒被注意，新增了自我稽核 workflow：

- Workflow：`.github/workflows/schedule-audit.yml`
- 設定檔：`.github/schedule-audit.json`

另外也新增「失敗即刻通報」的監控 workflow（只要指定 workflow run 結束且不是 success 就開/更新 issue）：

- Workflow：`.github/workflows/workflow-run-monitor.yml`
- 設定檔：`.github/workflow-run-monitor.json`

## 它會做什麼

- 每天固定時間（以 cron/UTC 觸發；註解標示對應 Asia/Taipei 時間）跑一次
- 透過 GitHub REST API 列出 repo workflows，依 workflow `name` 找到對應項目
- 讀取每個 workflow 的「最新一次 run」，檢查：
  - 最新 run 的時間距離現在是否超過 `max_age_minutes`
  - 最新 run 的 `conclusion` 是否為 `success`
  - （選用）若設定 `expected_event`，會要求最新 run 的 `event` 必須相符（例如 `schedule`）
  - （選用）若設定 `require_schedule: true`，會檢查該 workflow 檔案內是否包含 `on: schedule:` 與 `cron:`（避免以為有排程其實 YAML 沒寫）
- （選用）若 `.github/schedule-audit.json` 設定了 `pages_url`，會額外檢查 GitHub Pages 是否能成功回應（HTTP 2xx/3xx）
- 失敗時：
  - 若已存在同標題的 open issue：留言追加一筆稽核結果
  - 否則：開新 issue 讓你立刻看到哪個 workflow 掉了

## 你需要調整的地方

1. 把 `.github/schedule-audit.json` 裡的 `expected_workflows[]` 改成「Actions UI 上顯示的 workflow 名稱」完全一致（含大小寫）
   - 建議同時填 `path`（例如 `.github/workflows/refresh-race-weather.yml`），避免有人把 workflow 顯示名稱改掉造成誤判
2. 把 `max_age_minutes` 調整成符合各 workflow 預期頻率（例如每天、每週、週一三五等）
3. （選用）把 `pages_url` 設為你的 GitHub Pages 首頁 URL（例如 `https://<user>.github.io/<repo>/`），用來監控站點是否掛掉
4. （選用）設定 `expected_event`（常見值：`schedule`、`workflow_dispatch`、`push`），用來避免「手動跑過一次」但排程其實沒在跑的誤判
5. （選用）設定 `require_schedule: true`，用來驗證該 workflow 檔案真的有寫 `schedule` cron

## 手動觸發

GitHub UI：Actions → Schedule audit → Run workflow

## 失敗即刻通報（workflow-run-monitor）

- 這個 workflow 會在被監控的 workflow run `completed` 後觸發
- 如果 `conclusion != success`，會以 `Workflow failure: <workflow name>` 開/更新 issue，並附上 run URL
