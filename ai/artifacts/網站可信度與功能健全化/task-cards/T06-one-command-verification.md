# AI-Ready 任務卡

## Metadata
- 任務：T06 單一完整驗證入口
- 上層規格：`../feature-spec.md`（US6）
- 分軌：不適用
- 前置任務（dependsOn）：T01、T02、T03、T04、T05
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
用一個指令依序執行前端、資料、build 與 `uv run pytest -q`，任一步失敗即非零。

## 情境包（Context Pack）
- 相關檔案：`package.json`、既有 Node 驗證 scripts、Python tests。
- 不得依賴全域 pytest，不得吞掉失敗碼或改動測試資料正本。

## 驗收與驗證
- 單一命令涵蓋 syntax/smoke、layout、Trainer、資料一致性、Vite build、uv pytest。
- 人為製造一項 fixture 失敗時命令非零；還原後全綠；`git diff --check`。
