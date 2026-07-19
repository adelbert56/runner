# 統一教練模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把散亂的 6 個訓練優化器整併成單一權威決策器（`resolveCourse`）＋單一狀態源（`planStatus`），顯示層每個數據一個家，行為零流失。

**Architecture:** 分層權威堆疊（安全 > 我的週度處方 > 自動微調 > baseline）。新檔 `site/trainer-coach-engine.js`（classic script，全域，載於 trainer.js 前）放 context/status/resolver/adapter。分 4 phase，每 phase 行為保留、可驗可退。

**Tech Stack:** Vanilla JS classic script；驗證＝`node --check`＋`scripts/ui-smoke-check.mjs` 斷言＋dev server 瀏覽器 DOM＋行為對照 harness（node script 比對新舊輸出）。無 JS 單元框架。

**Spec:** `docs/superpowers/specs/2026-07-19-unified-coach-model-design.md`

---

## 驗證約定（本 repo 特有，取代 pytest）

- **語法**：`node --check site/<file>.js`
- **回歸**：`npm run check`（含 ui-smoke ~299 斷言），EXIT=0 且 OK 數不減。
- **行為對照 harness**：`scripts/_parity/*.mjs`（暫存，不進 commit）——載入舊函式輸出與新函式輸出，逐項 deep-equal，印 mismatch。
- **實機**：dev server（`preview_start name=runner-dev`）→ `/site/trainer.html` → seed 本機備份 → DOM 斷言 + console 零錯誤。
- seed 檔用法：`cp runner/runner-training-backup-2026-07-19.json site/_verify-seed.json`，驗完 `rm`。**個資，絕不 commit。**

---

## File Structure

| 檔 | 責任 | 動作 |
|----|------|------|
| `site/trainer-coach-engine.js` | buildContext / planStatus / resolveCourse / adapters | **新建**，載於 trainer.js 前 |
| `site/trainer.html` | script 載入序 + cache 參數 | 改 |
| `scripts/ui-smoke-check.mjs` | 串接清單 + 新斷言 | 改 |
| `package.json` | check 加 node --check 新檔 | 改 |
| `site/trainer-render.js` | 各卡改引用 planStatus / resolvedPlan | 改（分階段） |
| `site/trainer-plan.js` | autoRecalibratePlan 等包成 adapter | 改（Phase 2） |
| `site/trainer-safety.js` | applyCoachPlanOverride 併入 coachPrescription adapter | 改（Phase 2） |

---

## Phase 1：單一狀態源（`buildContext` + `planStatus`），零行為變更

**目的**：先把「同一組狀態數據各卡各自算」收斂成一次計算、多處引用。不改任何課程決策邏輯。

### Task 1.1：建立引擎檔骨架 + 載入接線

**Files:**
- Create: `site/trainer-coach-engine.js`
- Modify: `site/trainer.html`（script 區塊）
- Modify: `package.json`（check 腳本）
- Modify: `scripts/ui-smoke-check.mjs`（串接清單 + 1 斷言）

- [ ] **Step 1：建空引擎檔**

```javascript
// trainer-coach-engine.js
// 統一教練模型：單一 context/status/resolver。Classic script，全域，
// 載於 trainer.js 前，函式於 call time 才用到 trainer.js 的常數（安全）。
// 見 docs/superpowers/specs/2026-07-19-unified-coach-model-design.md
'use strict';
```

- [ ] **Step 2：trainer.html 加載入（safety 之後、copy 之前）**

在 `<script src="trainer-safety.js?v=20260718-safety1"></script>` 後加一行：
```html
<script src="trainer-coach-engine.js?v=20260719-engine1"></script>
```
> 註：'use strict' 在此檔頂層不影響其他 classic script（各檔獨立 strict）。但全域函式宣告在 strict 下仍是全域屬性——確認 `node --check` 過即可。

- [ ] **Step 3：package.json check 加新檔**

在 `node --check site/trainer-safety.js &&` 後插入 `node --check site/trainer-coach-engine.js &&`。

- [ ] **Step 4：ui-smoke 串接清單加新檔**

`scripts/ui-smoke-check.mjs`：Promise.all 陣列加 `readFile(resolve(root, "site/trainer-coach-engine.js"), "utf8")`，解構加變數 `trainerCoachEngineJs`，`trainer` 串接字串加 `\n${trainerCoachEngineJs}`。新增斷言：
```javascript
assertCheck(/trainer-coach-engine\.js/.test(trainerHtml) && trainerHtml.indexOf("trainer-coach-engine.js") < trainerHtml.indexOf("trainer.js"), "trainer loads the coach engine before the core script");
```

- [ ] **Step 5：驗證**

Run: `npm run check`
Expected: EXIT=0，OK 數 = 300（原 299 + 新斷言 1）。

- [ ] **Step 6：Commit**

```bash
git add site/trainer-coach-engine.js site/trainer.html package.json scripts/ui-smoke-check.mjs
git commit -m "feat(trainer): add coach-engine module skeleton"
```

### Task 1.2：`buildContext()` — 單一輸入組裝

**Files:**
- Modify: `site/trainer-coach-engine.js`
- Test（harness）: `scripts/_parity/context.mjs`（暫存）

- [ ] **Step 1：盤點現有各卡抓的輸入**（讀碼，非改碼）

確認來源：`appData.profile`、`appData.plan`、`coachReviewData`、`appData.checkins`、`trainerWeather`、`appData.safetyHold`、`trainingCompletionSummary().activityByDate`、`garminActivityRecords()`。

- [ ] **Step 2：實作 buildContext**

```javascript
function buildContext() {
  const plan = appData.plan || [];
  const summary = trainingCompletionSummary(plan);
  return {
    today: todayStr(),
    todayWeek: (typeof todayWeekNum === 'function' ? todayWeekNum() : currentWeek),
    profile: appData.profile || null,
    plan,
    coachReview: (typeof coachReviewData !== 'undefined' ? coachReviewData : null),
    checkins: appData.checkins || [],
    weather: (typeof trainerWeather !== 'undefined' ? trainerWeather : null),
    safetyHold: appData.safetyHold || null,
    garminRuns: (typeof garminActivityRecords === 'function' ? garminActivityRecords() : []),
    activityByDate: summary.activityByDate,
    planDayByDate: summary.planDayByDate,
    completion: summary,
  };
}
window.buildTrainerContext = buildContext; // for parity harness
```

- [ ] **Step 3：node --check**

Run: `node --check site/trainer-coach-engine.js`　Expected: OK。

- [ ] **Step 4：實機冒煙**（context 能組出且欄位齊）

dev server + seed，console 執行 `Object.keys(buildContext())`，確認 12 欄齊、`plan.length===22`、`activityByDate instanceof Map`。

- [ ] **Step 5：Commit**

```bash
git commit -am "feat(trainer): buildContext single input assembly"
```

### Task 1.3：`planStatus(ctx)` — 單一狀態源

**Files:**
- Modify: `site/trainer-coach-engine.js`
- Test（harness）: `scripts/_parity/status.mjs`

- [ ] **Step 1：定義 planStatus 欄位（依現有卡需求盤點）**

欄位集合（涵蓋 automation-brief / training-status-card / progress 預估 需要的全部）：
```javascript
function planStatus(ctx = buildContext()) {
  const plan = ctx.plan;
  const health = trainingDataHealth(plan);
  const decision = trainingAutopilotDecision(plan);
  const projection = (typeof fitnessProjection === 'function' ? fitnessProjection(ctx.profile) : null);
  const currWeekPlan = plan[ctx.todayWeek - 1] || plan[currentWeek - 1];
  const effectiveTarget = effectiveWeekVolumeTarget(currWeekPlan);
  const weekDates = new Set((currWeekPlan?.days || []).map((d) => d.dateStr));
  const currWeekDone = ctx.completion.allActivity
    .filter((e) => weekDates.has(e.date))
    .reduce((s, e) => s + (e.actualKm || 0), 0);
  const weekTargetKm = effectiveTarget.numericKm || 0;
  return {
    health,
    decision,                         // {tone,title,reason,next}
    projection,
    completion: ctx.completion,       // trainingCompletionSummary
    currentWeekCompleted: health.currentWeekCompleted.length,
    currentWeekDays: health.currentWeekDays.length,
    adherence: ctx.completion.elapsedSessions ? ctx.completion.adherence : null,
    totalKm: ctx.completion.totalKm,
    syncAge: health.syncAge,
    weekTargetKm,
    weekTargetDisplay: effectiveTarget.display,
    weekTargetSource: effectiveTarget.source,
    weekDoneKm: currWeekDone,
    weekProgressPct: weekTargetKm > 0 ? Math.min(100, Math.round((currWeekDone / weekTargetKm) * 100)) : 0,
    reminders: buildStatusReminders(health),  // 見 Step 2
  };
}
```

- [ ] **Step 2：抽 reminders（來自 renderTrainingStatusCard 的 reminders 陣列邏輯）**

把 `renderTrainingStatusCard` 內組 `reminders[]` 的邏輯原封搬成 `buildStatusReminders(health)` 回傳 `{list:[], stateTitle, stateCopy, action}`；renderTrainingStatusCard 改呼叫它（行為保留）。

- [ ] **Step 3：parity harness — 新 planStatus vs 現有卡數字**

`scripts/_parity/status.mjs`：seed 後於瀏覽器 console 比對 `planStatus()` 的 `weekProgressPct/currentWeekCompleted/adherence/totalKm` 與現行 automation-brief DOM 顯示數字逐一相等。（用 mcp Browser javascript_tool 執行比對，非 node。）
Expected: 全等。

- [ ] **Step 4：node --check + npm run check**

Expected: EXIT=0，OK 不減。

- [ ] **Step 5：Commit**

```bash
git commit -am "feat(trainer): planStatus single status source + reminders extraction"
```

### Task 1.4：各卡改引用 planStatus（殺顯示重複）

**Files:**
- Modify: `site/trainer-render.js`（renderWeekOverviewCard、renderTrainingStatusCard、renderGarminAutopilotCard 的 completion 計算）

- [ ] **Step 1：renderWeekOverviewCard 改用 planStatus**

把函式內 `trainingDataHealth`/`trainingAutopilotDecision`/`trainingCompletionSummary`/`effectiveWeekVolumeTarget`/手算 `currWeekDone`/`weekProgressPct` 全部改成 `const s = planStatus();` 後引用 `s.*`。輸出 HTML 結構不變、數字來源改為 s。

- [ ] **Step 2：實機對照**

seed 後截 automation-brief 文字，確認與 Phase 1 前逐字一致（數字不變）。

- [ ] **Step 3：npm run check + console 零錯誤**

- [ ] **Step 4：Commit**

```bash
git commit -am "refactor(trainer): week overview reads planStatus (kill recompute)"
```

### Task 1.5：Phase 1 驗收

- [ ] `npm run check` EXIT=0、OK ≥ 300。
- [ ] dev server 四 tab 全渲染、數字與 Phase 1 前一致、console 零錯誤。
- [ ] 移除 `scripts/_parity/` 暫存、確認 `site/_verify-seed.json` 已刪、git status 乾淨（除預期改動）。

---

## Phase 2：`resolveCourse()` 決策器 + 6 優化器包成 adapter（行為保留）

> 每個 adapter「行為保留」重構：先寫 parity harness（同輸入 → 舊函式輸出 == adapter 輸出），再搬邏輯，再把 resolver 串起來取代現有分散呼叫。

### Task 2.1：resolver 骨架 + adapter 介面契約
- [ ] 定義 `resolveCourse(day, ctx)` 依 §3 順序呼叫 adapter；adapter 介面 `(day, ctx) → {type:'veto'|'replace'|'patch', ...}|null`。
- [ ] 空 adapter 全回 null 時，resolveCourse 回傳 baseline（＝現行 day）→ parity：resolvedPlan 與現行 plan 逐日相等。
- [ ] node --check + 實機 + commit。

### Task 2.2：`baseline` + `coachPrescription` adapter
- [ ] `coachPrescription` = 搬 `applyCoachPlanOverride`（trainer-safety.js）邏輯，介面化。
- [ ] parity：每天 `coachPrescription(day,ctx)` 結果 == `applyCoachPlanOverride(day,week)`。
- [ ] resolver 串入這兩層；渲染改呼叫 `resolveCourse` 取代 `applyCoachPlanOverride`。實機對照 day card 不變。commit。

### Task 2.3：`safetyGuard` adapter（最高優先、只能減）
- [ ] 搬 applyDailySessionAdvisory 的安全判斷（疼痛/傷/極端高溫）+ safetyHold 成 `safetyGuard`，回 veto（封頂恢復/休息）。
- [ ] parity + 實機（構造疼痛情境驗證封頂）。commit。

### Task 2.4：`dailyAdjust` adapter（今日降階＋週內移課）
- [ ] 搬 applyDailySessionAdvisory 的降階/移課邏輯（去掉已移入 safetyGuard 的安全部分）。
- [ ] parity vs 現行 applyDailySessionAdvisory 淨效果。commit。

### Task 2.5：`progression` adapter（未來週遞增/校準/週評估）
- [ ] 整併 autoRecalibratePlan + garminLoadDecision + adjustNextWeek 成 `progression`，只作用「今天以後、未開處方」週。
- [ ] parity vs 現行三函式合成效果（同 Garmin/checkin 輸入 → 同未來週輸出）。commit。

### Task 2.6：`paceResolver` 橫貫
- [ ] 整併 hrZones + adaptiveEasyPaceSec + autoPaceCalibration 成 `paceResolver(ctx,date)`；resolveCourse 產出 course 時填 paces。
- [ ] parity。commit。

### Task 2.7：單一呼叫點收斂
- [ ] init/coach render 的 `autoRecalibratePlan()`/`applyDailySessionAdvisory()` 與渲染的 `applyCoachPlanOverride()` 全部改走 `resolveCourse`/一次 `resolvePlan(ctx)`。
- [ ] 全 parity（resolvedPlan 與 Phase 1 末的現行輸出逐日相等）+ 實機四 tab + commit。

---

## Phase 3：每天 rationale + 四 tab IA one-home

### Task 3.1：rationale
- [ ] resolveCourse 回傳 `rationale`（哪層決定今天課，如「安全封頂：回報膝蓋痛」「教練處方」「未來週自動遞增 +5%」）。
- [ ] day card 顯示 rationale 一行（取代各卡自編說明）。實機 + commit。

### Task 3.2：本週課表 tab one-home
- [ ] 頂部一條狀態列（planStatus）取代 automation-brief 內重複 stats；day card 已含 resolved course + rationale。
- [ ] 重複計數：週分頁內狀態數據每項僅 1 次。實機對照 + commit。

### Task 3.3：其餘三 tab one-home
- [ ] 教練建議＝週度處方＋rationale 彙整＋reminders（一處）；週評估＝表單＋結果；進度＝預測＋趨勢＋週期各一。
- [ ] 跨 tab 重複計數歸零（完成度/autopilot/週期 各 1）。實機 + commit。

---

## Phase 4：精簡 adapter（依 Phase 3 實際重疊再定）

### Task 4.1：合併重疊
- [ ] 檢視 dailyAdjust 與 progression、safetyGuard 與 safetyHold 的重疊，合併可合者。
- [ ] 全 parity + 實機 + commit。

### Task 4.2：清理死碼
- [ ] 移除被 adapter 取代後不再被呼叫的舊函式（確認 grep 無引用、ui-smoke 無斷言依賴後刪）。
- [ ] 更新 CLAUDE.md 模組表 + memory。npm run check + commit。

---

## Self-Review 註記

- **Spec 覆蓋**：§3 規則→Phase 2 adapter；§4 元件→Task 1.2/1.3/2.*；§6 顯示→Phase 3；§7 分階段→四 Phase 對應。
- **無 JS 單元框架**：以 parity harness + ui-smoke + 瀏覽器 DOM 取代 pytest，已於驗證約定聲明。
- **型別一致**：`buildContext`→`ctx`、`planStatus(ctx)`、`resolveCourse(day,ctx)`、adapter `(day,ctx)→{type,...}|null` 全程一致。
- **Phase 2–4 顆粒**：Phase 1 全 step 細節；Phase 2–4 為任務級，執行進該 Phase 時依同格式（先 parity、再搬、再串、再驗）展開 step。理由：adapter 具體搬移碼在讀到當前實作後才寫得準，避免計畫寫死過期行號。
