# Runner 專案指引

沿用全域規則。任務針對哪個功能，就從對應入口追依賴。大型任務用 `TASKS.md` 追蹤，相關插單完成後回到原驗收項目。

- 網頁工作先讀 `site/AGENTS.md`。行為與驗證入口以目前的程式碼、`package.json` 和測試為準。
- The user authorizes browser-based UI verification. Prefer an isolated browser profile and test data; if a browser surface crashes, use an alternative browser or the project's HTTP, DOM, and layout checks, and report any missing visual verification.
- 正式網站發佈、Garmin 寫入、正式資料變更及其他不可逆操作先取得明確授權。授權未到時先完成可做的本機驗證。
- For long tasks, repeated expensive checks, or monitoring, give concise progress updates and continue in bounded batches toward the requested outcome. Ask before continuing only when authorization, a spending limit, or an essential decision actually requires it.

## Training Plan (練跑計畫) Hard Rules

Lesson from 2026-10-25..11-17: the weekly coach blocked 4 weeks in a row (no workouts reached Garmin for a month) while an agent kept adding safety gates, ending with 120+ uncommitted, never-activated files.

- **Done = a real outcome, not passing tests.** Before claiming any trainer/coach fix is done, state whether this week's plan exists in `runner/訓練/週報.json` and reached Garmin. If not, it is not done.
- **Degrade, never stall.** Missing runner feedback means a conservative week (easy runs + rest, no progression), published as usual. Only explicit red flags (pain ≥3, gait change, dizziness, illness) mean a rest/protect week, which is still published. Never add a gate whose failure mode is "no plan this week".
- **Cap work in progress.** If uncommitted files exceed ~15, or two days pass with nothing activated in the real flow, stop adding mechanisms, report the risk, and prioritize integration, review, verification, and the next authorized delivery step. Continue work that does not require approval; do not stop solely because the threshold was reached.

---

<!-- monstrare:gate-rules -->
## Monstrare Gate Workflow

Backfilled from Monstrare (https://github.com/pjwang2022/Monstrare). Full rules in `ai/process/workflow.md`.

# Agent 指令

本專案使用 Monstrare。請遵循
`ai/process/workflow.md` 中的共用流程。

## 操作規則

- 不得根據模糊的需求實作非小型（non-trivial）變更。
- 從情境探索（context discovery）與任務專屬的情境包（context pack）開始。
- 實作前使用 `ai/process/definition-of-ready.md`。
- 宣告完成前使用 `ai/process/definition-of-done.md`。
- UI 變更需要畫面規格與 mockup 決策紀錄（以 `ai/templates/screen-spec.md`、`ai/templates/mockup-decision.md` 為範本，產出到 `ai/artifacts/<Epic>/`），並先對照 `ai/context/design-system.md`：重用既有 design token 與元件，缺的元件照既有風格補做並登記回元件庫 inventory。
- 範本（`ai/templates/`）唯讀；所有填寫完成的產出物依 `ai/artifacts/README.md` 的慣例存放。
- 任何 mockup 或前端視覺實作，套用 `ai/skills/design-craft.md` 的設計工藝紀律，交付前對照 `ai/checklists/design-review-checklist.md`。
- Epic 0 的 UI 設計系統須依五階段（框架 → 風格 → design token → 元件庫 → 版面）分關卡展開，不得一步到位直接畫版面（見 `ai/skills/project-kickoff.md` 步驟 2a）。
- 高風險變更需要架構、安全性與測試審查關卡（review gate）。
- 優先採用既有專案模式，而非新增抽象層。
- 將變更範圍限制在已核准的任務卡（task card）內。
- 不得在未告知的情況下變更不相關的檔案。
- 提供驗證證據：指令、輸出結果、UI 的螢幕截圖，以及已知的殘留風險。

## 必要流程

若是全新專案、還沒有 Epic/User Story 待辦清單，先執行 `project-kickoff` 流程，
把專案拆解成 Epic → User Story → Task 並建立看板卡片，再對每張任務卡套用下方流程。

1. 若 `ai/context/project-map.md` 存在，先閱讀它。
2. 若專案情境缺失或過時，執行 project-search 工作流程。
3. 對於新功能，建立或更新功能規格書。
4. 對於 UI 工作，產出多個 mockup 變體並等待人工選擇。
5. 產出 AI-ready 的任務卡。
6. 一次實作一張已核准的任務卡。
7. 執行驗證。
8. 執行審查關卡。
9. 彙整證據並在需要時請求人工驗收。

## 審查準則

審查程式碼時，優先關注：

- 功能性錯誤與回歸問題。
- 安全性與隱私風險。
- 身分驗證（auth）、權限、密鑰（secret）、檔案、網路與金流邊界。
- 資料驗證與錯誤處理。
- 可維護性、重複程式碼與架構偏移（architectural drift）。
- 缺失的測試或薄弱的驗證。

發現的問題應盡可能包含檔案與行號參照。
