# Runner Prompt Macros

Use these macros as the default openers for `Runner`.

## 1. Race Data Freshness Repair

```text
直接處理 Runner 的賽事資料問題到可交付。
先找 root cause，不要只看報告層。
正式 truth surface：
- source: runner/賽事/賽事資料庫.json
- generated: site/data/races.json
- owner scripts: scripts/
完成標準：來源已發布的資訊，生成輸出也正確反映。
如果 parser、override、report 三層都有問題，這輪一起修。
完成前用 source-to-output 證據驗證。
```

## 2. Automation / Pages Audit

```text
只讀或直接修都可以，但先用 GitHub/Pages 真實證據判斷。
目標：檢查 Runner automation / Pages 是否正常。
正式 truth surface：
- GitHub Actions runs
- site/data/automation-health.json
- site/data/operational-dashboard.json
- Pages 200 health
我要 findings、風險、下一步；若已明確有缺漏請直接修。
不要只靠本地看 workflow 檔案下結論。
```

## 3. site/app.js UI Or Training Plan Fix

```text
直接修 Runner 的前端行為到可交付。
正式 truth surface：
- site/app.js
- site/index.html
- site/styles.css
如果這個 UI 問題需要資料來源、文案或產生流程一起對齊，這輪一起處理。
完成前至少做 syntax gate，若是明顯 user-visible 問題再補 rendered 驗證。
```
