# AI-Ready 任務卡

## Metadata

- 任務：導入可驗證 Runner 架構圖與知識工具
- 上層規格：`ai/artifacts/工具化架構可追溯/feature-spec.md`
- 上層 Epic：工具化架構可追溯
- 上層 User Story：架構查核、完成判定、文件知識
- 分軌：不適用
- 前置任務（dependsOn）：無
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：使用者（「交給你優化了」）

## 目標

將 Runner 的三個高風險理解面轉為可重建、通過渲染檢查的技術圖，並安全安裝後續知識與視覺文件工具。

## 情境包（Context Pack）

- 相關檔案：`site/trainer-garmin-sync.js`、`site/trainer-render.js`、`site/trainer-actions.js`、`site/trainer-coach-engine.js`、`site/trainer.js`、`scripts/garmin/sync-garmin.ps1`、`scripts/build-training-review.mjs`。
- 既有模式：Garmin 同步僅刷新證據；完成判定共用 `trainingCompletionSummary()`；歷史課程優先於重建。
- 假設：本次只產生程式碼契約圖，不宣稱真實同步已執行。
- 已選定文件：`docs/GARMIN_TRAINING_API_APPLICATION.md`；它是專案內的申請草稿，不含活動、權杖或加密週報。
- 允許變更的檔案：`ai/architecture/`、`ai/artifacts/`、`ai/diagrams/`，以及本機 Agent skills 目錄。
- 不得觸碰：`runner/`、`site/data/`、Garmin 憑證與活動資料。

## 驗收標準

- Archify 的 architecture、dataflow 與 lifecycle 各通過九項 showcase 檢查並產生 HTML。
- 工具安裝來源為官方 GitHub 上游；book-to-skill 只轉換指定的非個資申請草稿並通過生成 skill 安全掃描。

## 驗證契約

- Build：Archify `validate` 與 `deliver`。
- 安全性檢查：三份安裝的 `SKILL.md` SHA-256；不讀取加密週報與 token。
- UI：不適用；產物由 Archify 組合驗證。
