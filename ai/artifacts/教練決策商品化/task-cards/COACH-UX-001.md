# AI-Ready 任務卡

## Metadata

- 任務：COACH-UX-001 決策優先的教練建議工作區
- 上層規格：`ai/artifacts/教練決策商品化/feature-spec.md`
- 上層 Epic：教練決策商品化
- 上層 User Story：決策導覽、證據追溯
- 分軌：前端
- 前置任務（dependsOn）：無
- 狀態：完成
- 風險等級：低
- Agent owner：Codex
- 人工核准者：Squall（授權選定試點）

## 目標

以既有資料與元件，讓教練建議先呈現本週可執行決策與下一堂課。

## 情境包

- 相關檔案：`site/trainer-render.js`、`site/trainer.css`、`scripts/ui-smoke-check.mjs`、`scripts/ui-layout-check.mjs`。
- 既有模式：`resolveWeeklyDecision()` 是唯一決策來源；Garmin 判讀與 coachMemory 均保留。
- 允許變更的檔案：上述兩個 site 檔與本 Epic 產出物。
- 不得觸碰：訓練處方、API、歷史週、Garmin 同步與資料模型。

## 驗收標準

- 決策、下一堂與動作出現在證據前。
- 內部 resolver 術語不再出現在使用者畫面。
- 指定檢核與 desktop/mobile 視覺驗證通過。
