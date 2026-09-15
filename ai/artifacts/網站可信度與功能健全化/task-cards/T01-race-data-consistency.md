# AI-Ready 任務卡

## Metadata
- 任務：T01 賽事正本與發布副本一致性閘門
- 上層規格：`../feature-spec.md`（US1）
- 分軌：後端
- 前置任務（dependsOn）：無
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
發布與完整驗證前比較正規化賽事內容；不一致時列出差異並非零退出，受控同步後逐位元一致。

## 情境包（Context Pack）
- 相關檔案：`runner/賽事/賽事資料庫.json`、`site/data/races.json`、`scripts/sync-race-data.mjs`、`scripts/validate-race-data.mjs`
- 允許變更：上述 scripts、package scripts、對應測試；不得改寫正本事實。

## 驗收與驗證
- 新增／刪除／變更皆可定位；一致時通過，不一致時非零。
- 執行資料品質測試、fixture 差異測試、`git diff --check`。
