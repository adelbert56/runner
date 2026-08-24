# AI-Ready 任務卡

## Metadata

- 任務：跑步陪伴課型一致性與步頻訊號巡檢
- 上層規格：`feature-spec.md`
- 分軌：前端／邏輯
- 前置任務（dependsOn）：`coach-decision-foundation`
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall（2026-08-24 授權巡檢）

## 問題與根因

- 課程卡以 resolver 的教練處方顯示「節奏跑」，跑步陪伴卻只讀舊的原始 `day.type/focus`，造成一堂課兩種分類。
- 步頻訊號只取有效主課／跑步分圈，但跨課次以等權平均，短課可能過度影響長課趨勢。

## 修正與驗收

- 跑步陪伴改用與可見課程卡相同的 `resolveCourse` 結果；安全降階仍優先於教練處方。
- 所有課型（恢復、輕鬆、節奏、間歇、長跑、比賽）各自保留對應陪伴內容；真恢復跑才顯示 140–155 BPM。
- 步頻僅使用已篩選的有效資料，並按主課／分圈距離加權；仍為提醒訊號，不直接降量。

## 驗證契約

- `node scripts/trainer-logic-check.mjs`：教練節奏處方不會掉回恢復陪伴、真恢復跑不回歸、短課不主導步頻。
- `npm run check`：靜態載入、UI smoke 與既有回歸。
- `git diff --check`：無格式或空白差異。
