# Runner 技術圖

本目錄的 JSON 是 Archify 可驗證來源；HTML 為由同一來源產生的獨立閱讀檔。

| 圖 | 用途 | 來源 |
|---|---|---|
| `runner-garmin-runtime` | 本機 Garmin 同步、加密週報與 Trainer 消費邊界 | `site/server.mjs`、`site/trainer-garmin-sync.js`、`scripts/garmin/sync-garmin.ps1`、`scripts/build-training-review.mjs` |
| `runner-completion-evidence` | 品質課完成判定、標籤補正與週檢測的共用資料規則 | `site/trainer-render.js`、`site/trainer-actions.js`、`site/trainer-coach-engine.js` |
| `runner-coach-week` | 提前調整、正式處方、重複保護與歷史週隔離 | `site/trainer-actions.js`、`site/trainer-coach-engine.js`、`site/trainer.js` |

更新圖前，先依實際程式碼更新 JSON，再執行：

```powershell
$archify = 'C:\\Users\\Squall\\.codex\\skills\\archify'
node "$archify\\bin\\archify.mjs" validate <architecture|dataflow> <json> --quality showcase --json
node "$archify\\bin\\archify.mjs" deliver <architecture|dataflow> <json> <html> --quality showcase --json
```

技術圖描述已撰寫及經檢查的程式碼契約，並非 Garmin 或排程已實際執行的證明；實際執行仍須以同步收據與狀態檔驗證。
