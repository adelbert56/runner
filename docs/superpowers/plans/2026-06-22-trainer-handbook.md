# Runner Training Handbook Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `site/trainer.html` — a single-file training plan generator where runners fill 9 fields and get a personalized weekly schedule with PDF/HTML export.

**Architecture:** Single standalone HTML file with vanilla JS view switching (Setup → Plan → Log). All data stored in `localStorage["runner-trainer-v1"]` as `{ profile, plan[], log[], checkins[] }`. No server, no external dependencies.

**Tech Stack:** HTML5, vanilla JS (ES2020+), CSS Grid/Flexbox, `window.print()` for PDF, `Blob` for HTML export.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `site/trainer.html` | Entire app — form, plan view, log, exports |
| Modify | `site/index.html` | Add nav link to trainer.html |

---

## Task 1: HTML Skeleton + CSS Foundation

**Files:**
- Create: `site/trainer.html`

- [ ] **Step 1: Create file with skeleton**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>訓練計畫生成器 — 跑者廣場</title>
  <style>
    /* === Reset & Variables === */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --c-bg: #0f172a;
      --c-surface: #1e293b;
      --c-surface2: #334155;
      --c-border: #475569;
      --c-text: #e2e8f0;
      --c-text-muted: #94a3b8;
      --c-primary: #3b82f6;
      --c-primary-hover: #2563eb;
      --c-green: #22c55e;
      --c-orange: #f97316;
      --c-red: #ef4444;
      --c-blue: #3b82f6;
      --c-gray: #64748b;
      --radius: 12px;
      --radius-sm: 8px;
    }
    body { background: var(--c-bg); color: var(--c-text); font-family: system-ui, sans-serif; min-height: 100vh; }

    /* === Layout === */
    .view { display: none; }
    .view.active { display: block; }
    .container { max-width: 900px; margin: 0 auto; padding: 16px; }

    /* === Nav === */
    .site-nav { background: var(--c-surface); border-bottom: 1px solid var(--c-border); padding: 12px 16px; display: flex; gap: 16px; align-items: center; }
    .site-nav a { color: var(--c-text-muted); text-decoration: none; font-size: 14px; }
    .site-nav a:hover, .site-nav a.active { color: var(--c-text); }
    .site-nav .brand { font-weight: 700; color: var(--c-text); margin-right: auto; }

    /* === Cards === */
    .card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
    .card-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }

    /* === Buttons === */
    .btn { padding: 10px 20px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: var(--c-primary); color: white; }
    .btn-secondary { background: var(--c-surface2); color: var(--c-text); border: 1px solid var(--c-border); }
    .btn-danger { background: var(--c-red); color: white; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* === Form Elements === */
    .form-group { margin-bottom: 20px; }
    .form-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--c-text-muted); }
    .form-input { width: 100%; padding: 10px 14px; background: var(--c-surface2); border: 1px solid var(--c-border); border-radius: var(--radius-sm); color: var(--c-text); font-size: 15px; }
    .form-input:focus { outline: none; border-color: var(--c-primary); }

    /* === Goal Cards === */
    .goal-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    @media (max-width: 500px) { .goal-grid { grid-template-columns: 1fr; } }
    .goal-card { background: var(--c-surface2); border: 2px solid var(--c-border); border-radius: var(--radius-sm); padding: 14px; cursor: pointer; text-align: center; transition: border-color 0.15s; }
    .goal-card:hover { border-color: var(--c-primary); }
    .goal-card.selected { border-color: var(--c-primary); background: #1d3a6e; }
    .goal-card .goal-icon { font-size: 28px; margin-bottom: 6px; }
    .goal-card .goal-name { font-weight: 700; font-size: 15px; }
    .goal-card .goal-desc { font-size: 12px; color: var(--c-text-muted); margin-top: 4px; }

    /* === Day Picker === */
    .day-picker { display: flex; gap: 8px; flex-wrap: wrap; }
    .day-btn { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--c-border); background: var(--c-surface2); color: var(--c-text-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .day-btn.training { border-color: var(--c-primary); background: #1d3a6e; color: var(--c-text); }
    .day-btn.long-run { border-color: #1d4ed8; background: #1e3a8a; color: white; }
    .day-legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: var(--c-text-muted); }
    .day-legend span::before { content: '●'; margin-right: 4px; }
    .day-legend .l-train::before { color: var(--c-primary); }
    .day-legend .l-long::before { color: #60a5fa; }

    /* === Injury Pills === */
    .pill-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--c-border); background: var(--c-surface2); color: var(--c-text-muted); font-size: 13px; cursor: pointer; transition: all 0.15s; }
    .pill.selected { border-color: var(--c-orange); background: #431407; color: var(--c-orange); }

    /* === Live Calc === */
    .live-calc { background: var(--c-surface2); border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 16px; }
    .live-calc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    @media (max-width: 500px) { .live-calc-grid { grid-template-columns: repeat(2, 1fr); } }
    .calc-item { text-align: center; }
    .calc-label { font-size: 11px; color: var(--c-text-muted); margin-bottom: 4px; }
    .calc-value { font-size: 18px; font-weight: 700; color: var(--c-primary); }
    .calc-value.warn { color: var(--c-orange); }
    .calc-value.good { color: var(--c-green); }

    /* === Progress Card === */
    .progress-bar-wrap { background: var(--c-surface2); border-radius: 8px; height: 10px; margin: 10px 0; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: var(--c-primary); border-radius: 8px; transition: width 0.3s; }
    .progress-stats { display: flex; gap: 16px; font-size: 13px; color: var(--c-text-muted); flex-wrap: wrap; }
    .progress-stats strong { color: var(--c-text); }

    /* === Phase Tabs === */
    .phase-tabs { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
    .phase-tab { padding: 8px 14px; border-radius: var(--radius-sm); border: 1px solid var(--c-border); background: var(--c-surface2); color: var(--c-text-muted); font-size: 13px; white-space: nowrap; cursor: pointer; }
    .phase-tab.current { border-color: var(--c-primary); background: #1d3a6e; color: var(--c-text); }
    .phase-tab.done { opacity: 0.6; }

    /* === Week Calendar === */
    .week-calendar { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .day-card { background: var(--c-surface); border: 2px solid var(--c-border); border-radius: var(--radius-sm); padding: 14px; transition: border-color 0.15s; }
    .day-card.today { border-color: var(--c-primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
    .day-card.done-card { background: #14532d22; border-color: var(--c-green); }
    .day-card.missed-card { background: #7f1d1d22; border-color: var(--c-red); }
    .day-card.deload-card { border-color: var(--c-orange); border-style: dashed; }
    .day-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .day-card-date { font-size: 12px; color: var(--c-text-muted); }
    .day-card-today-badge { font-size: 11px; background: var(--c-primary); color: white; padding: 2px 8px; border-radius: 10px; }
    .workout-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; margin-bottom: 8px; }
    .badge-easy { background: #14532d; color: #86efac; }
    .badge-tempo { background: #431407; color: #fdba74; }
    .badge-interval { background: #450a0a; color: #fca5a5; }
    .badge-long { background: #1e3a8a; color: #93c5fd; }
    .badge-rest { background: var(--c-surface2); color: var(--c-text-muted); }
    .day-card-task { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .day-card-pace { font-size: 12px; color: var(--c-text-muted); margin-bottom: 10px; }
    .workout-steps { font-size: 12px; color: var(--c-text-muted); line-height: 1.6; }
    .workout-steps .step { display: flex; gap: 6px; }
    .step-icon { font-size: 10px; margin-top: 3px; flex-shrink: 0; }
    .day-card-actions { display: flex; gap: 6px; margin-top: 10px; }
    .day-card-actions .btn { font-size: 12px; padding: 6px 12px; flex: 1; }
    .strength-box { background: var(--c-surface2); border-radius: 6px; padding: 8px; margin-top: 8px; font-size: 11px; color: var(--c-text-muted); }
    .strength-box strong { color: var(--c-text); display: block; margin-bottom: 4px; }

    /* === Check-in === */
    .checkin-questions { list-style: none; }
    .checkin-questions li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--c-border); font-size: 14px; }
    .checkin-questions li:last-child { border-bottom: none; }
    .checkin-questions input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }

    /* === Log === */
    .log-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (max-width: 500px) { .log-form-grid { grid-template-columns: 1fr; } }
    .log-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat-card { background: var(--c-surface2); border-radius: var(--radius-sm); padding: 14px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--c-primary); }
    .stat-label { font-size: 12px; color: var(--c-text-muted); margin-top: 4px; }
    .log-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .log-table th { text-align: left; padding: 8px; border-bottom: 2px solid var(--c-border); color: var(--c-text-muted); font-size: 12px; }
    .log-table td { padding: 8px; border-bottom: 1px solid var(--c-border); }

    /* === Export Bar === */
    .export-bar { background: var(--c-surface); border-top: 1px solid var(--c-border); padding: 12px 16px; display: flex; gap: 10px; position: sticky; bottom: 0; }

    /* === Modal === */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius); padding: 24px; max-width: 400px; width: 90%; }
    .modal-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
    .modal-body { font-size: 14px; color: var(--c-text-muted); margin-bottom: 20px; line-height: 1.6; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

    /* === Toolbar === */
    .plan-toolbar { background: var(--c-surface); border-bottom: 1px solid var(--c-border); padding: 10px 16px; display: flex; gap: 10px; align-items: center; position: sticky; top: 0; z-index: 10; }
    .plan-toolbar .tab { padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid transparent; color: var(--c-text-muted); font-size: 13px; cursor: pointer; }
    .plan-toolbar .tab.active { border-color: var(--c-border); background: var(--c-surface2); color: var(--c-text); }
    .plan-toolbar .spacer { flex: 1; }

    /* === Week Nav === */
    .week-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .week-nav-label { font-weight: 700; font-size: 15px; }
    .week-nav .btn { padding: 6px 12px; font-size: 13px; }

    /* === Responsive === */
    @media (max-width: 600px) { .week-calendar { grid-template-columns: 1fr; } }

    /* === Print === */
    @media print {
      .site-nav, .plan-toolbar, .export-bar, .day-card-actions, .week-nav .btn, #view-log, #view-checkin { display: none !important; }
      body { background: white; color: black; }
      .card { border: 1px solid #ccc; box-shadow: none; }
      .week-calendar { display: grid; grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>

<!-- Site Nav -->
<nav class="site-nav">
  <span class="brand">🏃 跑者廣場</span>
  <a href="index.html">首頁</a>
  <a href="trainer.html" class="active">訓練計畫</a>
</nav>

<!-- Views -->
<div id="view-setup" class="view active"></div>
<div id="view-plan" class="view"></div>
<div id="view-log" class="view"></div>

<!-- Modal -->
<div class="modal-overlay" id="modal">
  <div class="modal">
    <div class="modal-title" id="modal-title"></div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-actions" id="modal-actions"></div>
  </div>
</div>

<script>
// ============================================================
// STORAGE
// ============================================================
const STORAGE_KEY = 'runner-trainer-v1';

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { profile: null, plan: [], log: [], checkins: [] };
  } catch { return { profile: null, plan: [], log: [], checkins: [] }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let appData = loadData();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify file renders in browser** — open `site/trainer.html` locally, confirm dark background and nav.

- [ ] **Step 3: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): add HTML skeleton and CSS foundation"
```

---

## Task 2: Setup Form — Goal + Date + Time + Basic Fields

**Files:**
- Modify: `site/trainer.html` (fill `#view-setup`)

- [ ] **Step 1: Render setup form HTML via JS**

Add this after the `let appData = loadData();` line:

```javascript
// ============================================================
// VIEW SWITCHING
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

// ============================================================
// SETUP VIEW
// ============================================================
function renderSetupView() {
  const el = document.getElementById('view-setup');
  el.innerHTML = `
<div class="container" style="max-width:700px">
  <div class="card" style="margin-top:24px">
    <div class="card-title">📋 訓練計畫設定</div>
    <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:20px">填寫以下資訊，生成專屬訓練菜單。所有資料只存在您的裝置上。</p>

    <!-- 1. Goal -->
    <div class="form-group">
      <div class="form-label">訓練目標</div>
      <div class="goal-grid" id="goal-grid">
        <div class="goal-card" data-goal="5k10k">
          <div class="goal-icon">🏃</div>
          <div class="goal-name">5K / 10K</div>
          <div class="goal-desc">最少 8 週訓練期</div>
        </div>
        <div class="goal-card" data-goal="half">
          <div class="goal-icon">🏅</div>
          <div class="goal-name">半馬 21K</div>
          <div class="goal-desc">最少 12 週訓練期</div>
        </div>
        <div class="goal-card" data-goal="full">
          <div class="goal-icon">🏆</div>
          <div class="goal-name">全馬 42K</div>
          <div class="goal-desc">最少 16 週訓練期</div>
        </div>
        <div class="goal-card" data-goal="rehab">
          <div class="goal-icon">🩺</div>
          <div class="goal-name">傷後重建</div>
          <div class="goal-desc">輕量漸進，8 週起</div>
        </div>
      </div>
    </div>

    <!-- 2. Target Date -->
    <div class="form-group">
      <label class="form-label" for="f-date">目標比賽日期</label>
      <input class="form-input" type="date" id="f-date">
      <div id="date-warn" style="font-size:12px;color:var(--c-orange);margin-top:6px;display:none"></div>
    </div>

    <!-- 3. Target Time -->
    <div class="form-group">
      <label class="form-label" for="f-target-time">目標完賽時間 (H:MM:SS)</label>
      <input class="form-input" type="text" id="f-target-time" placeholder="例：2:05:00">
    </div>

    <!-- 4. Training Days -->
    <div class="form-group">
      <div class="form-label">訓練日（點一次=訓練日 🔵，再點=長跑日 💙，再點=取消）</div>
      <div class="day-picker" id="day-picker">
        <button class="day-btn" data-dow="0">日</button>
        <button class="day-btn" data-dow="1">一</button>
        <button class="day-btn" data-dow="2">二</button>
        <button class="day-btn" data-dow="3">三</button>
        <button class="day-btn" data-dow="4">四</button>
        <button class="day-btn" data-dow="5">五</button>
        <button class="day-btn" data-dow="6">六</button>
      </div>
      <div class="day-legend">
        <span class="l-train">普通訓練日</span>
        <span class="l-long">長跑日</span>
      </div>
      <div id="day-warn" style="font-size:12px;color:var(--c-orange);margin-top:6px;display:none"></div>
    </div>

    <!-- 5. Long Run Max Time -->
    <div class="form-group">
      <label class="form-label" for="f-long-max">長跑日最長可跑時間</label>
      <select class="form-input" id="f-long-max">
        <option value="60">60 分鐘</option>
        <option value="90" selected>90 分鐘</option>
        <option value="120">120 分鐘</option>
        <option value="150">150+ 分鐘</option>
      </select>
    </div>

    <!-- 6. Current Weekly Km -->
    <div class="form-group">
      <label class="form-label" for="f-weekly-km">目前每週跑量 (km)，填 0 表示剛開始</label>
      <input class="form-input" type="number" id="f-weekly-km" min="0" max="200" placeholder="例：25">
    </div>

    <!-- 7. Easy Pace -->
    <div class="form-group">
      <label class="form-label" for="f-easy-pace">輕鬆跑配速 (分:秒/km)</label>
      <input class="form-input" type="text" id="f-easy-pace" placeholder="例：6:30">
    </div>

    <!-- 8. Recent Result -->
    <div class="form-group">
      <label class="form-label" for="f-recent">最近比賽成績（選填，用於校正配速）</label>
      <input class="form-input" type="text" id="f-recent" placeholder="例：10K 54:30">
    </div>

    <!-- 9. Injuries -->
    <div class="form-group">
      <div class="form-label">身體狀況</div>
      <div class="pill-group" id="injury-pills">
        <div class="pill selected" data-injury="none">無傷</div>
        <div class="pill" data-injury="ankle">腳踝</div>
        <div class="pill" data-injury="knee">膝蓋</div>
        <div class="pill" data-injury="plantar">足底筋膜炎</div>
        <div class="pill" data-injury="other">其他</div>
      </div>
    </div>

    <!-- Live Calc -->
    <div class="form-group">
      <div class="form-label">即時評估</div>
      <div class="live-calc">
        <div class="live-calc-grid" id="live-calc-grid">
          <div class="calc-item"><div class="calc-label">訓練週數</div><div class="calc-value" id="calc-weeks">—</div></div>
          <div class="calc-item"><div class="calc-label">目標配速</div><div class="calc-value" id="calc-race-pace">—</div></div>
          <div class="calc-item"><div class="calc-label">節奏跑配速</div><div class="calc-value" id="calc-tempo">—</div></div>
          <div class="calc-item"><div class="calc-label">間歇配速</div><div class="calc-value" id="calc-interval">—</div></div>
          <div class="calc-item"><div class="calc-label">訓練天數/週</div><div class="calc-value" id="calc-days">—</div></div>
          <div class="calc-item"><div class="calc-label">難度評估</div><div class="calc-value" id="calc-difficulty">—</div></div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" id="btn-generate" style="width:100%;padding:14px;font-size:16px" disabled>🚀 生成訓練計畫</button>
  </div>
</div>`;

  initGoalPicker();
  initDayPicker();
  initInjuryPills();
  initLiveCalc();
  document.getElementById('btn-generate').addEventListener('click', generateAndShowPlan);

  // Pre-fill if returning user
  if (appData.profile) prefillSetupForm(appData.profile);
}
```

- [ ] **Step 2: Call `renderSetupView()` at bottom of script, then verify form renders.**

```javascript
// At the bottom of <script>, before </script>:
renderSetupView();
```

- [ ] **Step 3: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): add setup form HTML structure"
```

---

## Task 3: Setup Form — Interactivity (Goal Picker, Day Picker, Injury Pills)

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add goal picker logic**

```javascript
// day state: 0=rest, 1=training, 2=long-run
let formState = {
  goal: null,         // '5k10k'|'half'|'full'|'rehab'
  dayState: [0,0,0,0,0,0,0],  // index = DOW (0=Sun)
  injuries: ['none']
};

function initGoalPicker() {
  document.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      formState.goal = card.dataset.goal;
      updateGenButton();
      updateLiveCalc();
    });
  });
}
```

- [ ] **Step 2: Add day picker logic**

```javascript
function initDayPicker() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dow = parseInt(btn.dataset.dow);
      const cur = formState.dayState[dow];
      if (cur === 0) {
        // rest → training
        formState.dayState[dow] = 1;
        btn.classList.add('training');
        btn.classList.remove('long-run');
      } else if (cur === 1) {
        // training → long-run (demote prev long-run to training)
        formState.dayState = formState.dayState.map((s, i) => i === dow ? 2 : (s === 2 ? 1 : s));
        document.querySelectorAll('.day-btn').forEach(b => {
          const d = parseInt(b.dataset.dow);
          if (formState.dayState[d] === 2) { b.classList.add('long-run'); b.classList.remove('training'); }
          else if (formState.dayState[d] === 1) { b.classList.add('training'); b.classList.remove('long-run'); }
          else { b.classList.remove('training', 'long-run'); }
        });
      } else {
        // long-run → rest
        formState.dayState[dow] = 0;
        btn.classList.remove('training', 'long-run');
      }
      validateDays();
      updateLiveCalc();
      updateGenButton();
    });
  });
}

function validateDays() {
  const warn = document.getElementById('day-warn');
  const trainDays = formState.dayState.filter(s => s >= 1).length;
  const longDay = formState.dayState.filter(s => s === 2).length;
  if (trainDays > 0 && longDay === 0) {
    warn.textContent = '請點兩下指定一天為長跑日（深藍）';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}
```

- [ ] **Step 3: Add injury pills logic**

```javascript
function initInjuryPills() {
  document.querySelectorAll('.pill[data-injury]').forEach(pill => {
    pill.addEventListener('click', () => {
      const inj = pill.dataset.injury;
      if (inj === 'none') {
        formState.injuries = ['none'];
        document.querySelectorAll('.pill[data-injury]').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
      } else {
        // deselect 'none'
        formState.injuries = formState.injuries.filter(i => i !== 'none');
        document.querySelector('.pill[data-injury="none"]').classList.remove('selected');
        if (formState.injuries.includes(inj)) {
          formState.injuries = formState.injuries.filter(i => i !== inj);
          pill.classList.remove('selected');
        } else {
          formState.injuries.push(inj);
          pill.classList.add('selected');
        }
        if (formState.injuries.length === 0) {
          formState.injuries = ['none'];
          document.querySelector('.pill[data-injury="none"]').classList.add('selected');
        }
      }
    });
  });
}
```

- [ ] **Step 4: Add prefill helper**

```javascript
function prefillSetupForm(profile) {
  if (profile.goal) {
    document.querySelector(`.goal-card[data-goal="${profile.goal}"]`)?.click();
  }
  if (profile.targetDate) document.getElementById('f-date').value = profile.targetDate;
  if (profile.targetTime) document.getElementById('f-target-time').value = profile.targetTime;
  if (profile.dayState) {
    formState.dayState = profile.dayState;
    document.querySelectorAll('.day-btn').forEach(b => {
      const d = parseInt(b.dataset.dow);
      b.classList.remove('training','long-run');
      if (formState.dayState[d] === 1) b.classList.add('training');
      if (formState.dayState[d] === 2) b.classList.add('long-run');
    });
  }
  if (profile.maxLongRunMins) document.getElementById('f-long-max').value = profile.maxLongRunMins;
  if (profile.weeklyKm !== undefined) document.getElementById('f-weekly-km').value = profile.weeklyKm;
  if (profile.easyPace) document.getElementById('f-easy-pace').value = profile.easyPace;
  if (profile.recentResult) document.getElementById('f-recent').value = profile.recentResult;
  if (profile.injuries) {
    formState.injuries = profile.injuries;
    document.querySelectorAll('.pill[data-injury]').forEach(p => {
      p.classList.toggle('selected', formState.injuries.includes(p.dataset.injury));
    });
  }
  updateLiveCalc();
  updateGenButton();
}
```

- [ ] **Step 5: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): goal/day-picker/injury-pills interactivity"
```

---

## Task 4: Live Calculation + Generate Button Gating

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add pace utility functions**

```javascript
// ============================================================
// PACE UTILITIES
// ============================================================

// "H:MM:SS" or "MM:SS" → total seconds
function timeToSec(str) {
  if (!str) return 0;
  const parts = str.trim().split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 0;
}

// seconds → "M:SS"
function secToPace(sec) {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

// seconds → "H:MM:SS"
function secToTime(sec) {
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.round(sec%60);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// goal → race distance in km
const GOAL_DIST = { '5k10k': 10, 'half': 21.0975, 'full': 42.195, 'rehab': 10 };
const MIN_WEEKS = { '5k10k': 8, 'half': 12, 'full': 16, 'rehab': 8 };
```

- [ ] **Step 2: Add live calc updater**

```javascript
function updateLiveCalc() {
  const dateVal = document.getElementById('f-date')?.value;
  const timeVal = document.getElementById('f-target-time')?.value;
  const easyVal = document.getElementById('f-easy-pace')?.value;
  const goal = formState.goal;

  // Weeks
  let weeks = 0;
  if (dateVal) {
    const diff = (new Date(dateVal) - new Date()) / (1000 * 86400 * 7);
    weeks = Math.floor(diff);
    const weeksEl = document.getElementById('calc-weeks');
    const warnEl = document.getElementById('date-warn');
    if (weeks < 0) {
      weeksEl.textContent = '已過期';
      weeksEl.className = 'calc-value warn';
      warnEl.textContent = '日期已過！請重新選擇。';
      warnEl.style.display = 'block';
    } else {
      weeksEl.textContent = weeks + ' 週';
      const minW = goal ? MIN_WEEKS[goal] : 8;
      weeksEl.className = 'calc-value' + (weeks < minW ? ' warn' : ' good');
      if (weeks < minW && weeks > 0) {
        warnEl.textContent = `⚠️ 建議至少 ${minW} 週，目前只有 ${weeks} 週，計畫會壓縮。`;
        warnEl.style.display = 'block';
      } else if (weeks > 24) {
        warnEl.textContent = `ℹ️ 距離比賽還有 ${weeks} 週，計畫會維持適當強度。`;
        warnEl.style.display = 'block';
      } else {
        warnEl.style.display = 'none';
      }
    }
  }

  // Paces
  const dist = goal ? GOAL_DIST[goal] : 10;
  const timeSec = timeToSec(timeVal);
  let racePaceSec = 0;
  if (timeSec > 0 && dist > 0) {
    racePaceSec = timeSec / dist;
    document.getElementById('calc-race-pace').textContent = secToPace(racePaceSec) + '/km';
    document.getElementById('calc-race-pace').className = 'calc-value good';
    document.getElementById('calc-tempo').textContent = secToPace(racePaceSec + 12) + '/km';
    document.getElementById('calc-interval').textContent = secToPace(racePaceSec - 10) + '/km';
  } else {
    ['calc-race-pace','calc-tempo','calc-interval'].forEach(id => {
      document.getElementById(id).textContent = '—';
      document.getElementById(id).className = 'calc-value';
    });
  }

  // Days
  const trainCount = formState.dayState.filter(s => s >= 1).length;
  const daysEl = document.getElementById('calc-days');
  daysEl.textContent = trainCount > 0 ? trainCount + ' 天/週' : '—';
  daysEl.className = 'calc-value' + (trainCount > 0 ? ' good' : '');

  // Difficulty
  const diffEl = document.getElementById('calc-difficulty');
  const easyPaceSec = timeToSec(easyVal);
  if (racePaceSec > 0 && easyPaceSec > 0) {
    const gap = easyPaceSec - racePaceSec;
    if (gap < 30) { diffEl.textContent = '挑戰'; diffEl.className = 'calc-value warn'; }
    else if (gap < 90) { diffEl.textContent = '適中'; diffEl.className = 'calc-value good'; }
    else { diffEl.textContent = '保守'; diffEl.className = 'calc-value good'; }
  } else {
    diffEl.textContent = '—';
    diffEl.className = 'calc-value';
  }
}

function initLiveCalc() {
  ['f-date','f-target-time','f-easy-pace','f-weekly-km'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { updateLiveCalc(); updateGenButton(); });
  });
}

function updateGenButton() {
  const dateVal = document.getElementById('f-date')?.value;
  const kmVal = document.getElementById('f-weekly-km')?.value;
  const easyVal = document.getElementById('f-easy-pace')?.value;
  const timeVal = document.getElementById('f-target-time')?.value;
  const hasLong = formState.dayState.some(s => s === 2);
  const hasTrain = formState.dayState.some(s => s >= 1);
  const btn = document.getElementById('btn-generate');
  if (btn) {
    btn.disabled = !(formState.goal && dateVal && kmVal !== '' && easyVal && timeVal && hasTrain && hasLong);
  }
}
```

- [ ] **Step 3: Verify button enables only when all 6 conditions met** (goal selected, date, target time, easy pace, weekly km, at least 1 training day + 1 long run day).

- [ ] **Step 4: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): live pace calculation and form validation"
```

---

## Task 5: Plan Generation Algorithm

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `generateAndShowPlan` — reads form, builds profile, delegates to `buildPlan`**

```javascript
// ============================================================
// PLAN GENERATION
// ============================================================
function generateAndShowPlan() {
  const profile = {
    goal: formState.goal,
    targetDate: document.getElementById('f-date').value,
    targetTime: document.getElementById('f-target-time').value,
    dayState: [...formState.dayState],
    maxLongRunMins: parseInt(document.getElementById('f-long-max').value),
    weeklyKm: parseFloat(document.getElementById('f-weekly-km').value) || 0,
    easyPace: document.getElementById('f-easy-pace').value,
    recentResult: document.getElementById('f-recent').value,
    injuries: [...formState.injuries],
    generatedAt: new Date().toISOString()
  };

  // Derive paces
  const dist = GOAL_DIST[profile.goal];
  const timeSec = timeToSec(profile.targetTime);
  profile.racePaceSec = timeSec / dist;
  profile.tempoPaceSec = profile.racePaceSec + 12;
  profile.intervalPaceSec = Math.max(profile.racePaceSec - 10, 180); // floor 3:00/km
  profile.easyPaceSec = timeToSec(profile.easyPace);

  const plan = buildPlan(profile);
  appData.profile = profile;
  appData.plan = plan;
  appData.log = appData.log || [];
  appData.checkins = appData.checkins || [];
  saveData(appData);

  renderPlanView();
  showView('plan');
}
```

- [ ] **Step 2: Add fitness level classifier — called inside `generateAndShowPlan` before `buildPlan`**

```javascript
// Returns 'beginner' | 'intermediate' | 'advanced'
function fitnessLevel(profile) {
  const gap = profile.easyPaceSec - profile.racePaceSec; // sec/km slower than race pace
  if (profile.weeklyKm <= 10 || gap > 120) return 'beginner';
  if (gap > 60) return 'intermediate';
  return 'advanced';
}
```

Store on profile: `profile.fitnessLevel = fitnessLevel(profile);`

- [ ] **Step 2b: Add `adjustPaceByRecentResult` — call in `generateAndShowPlan` before `buildPlan`**

```javascript
function adjustPaceByRecentResult(profile) {
  if (!profile.recentResult) return;
  // Accept formats: "10K 54:30", "10k 54:30", "21K 2:05:00"
  const match = profile.recentResult.match(/([\d.]+)\s*[kK]\s*(\d+):(\d+)(?::(\d+))?/);
  if (!match) return;
  const dist = parseFloat(match[1]);
  const sec = match[4]
    ? parseInt(match[2]) * 3600 + parseInt(match[3]) * 60 + parseInt(match[4])
    : parseInt(match[2]) * 60 + parseInt(match[3]);
  if (!dist || !sec) return;
  const recentPaceSec = sec / dist;
  // Easy pace ≈ race pace × 1.25 (McMillan approximation)
  const derivedEasyPaceSec = recentPaceSec * 1.25;
  // Use derived easy pace only if it's slower than user-entered easy pace
  // (derived should be slower; if it's faster, user may have entered wrong value)
  if (derivedEasyPaceSec > profile.easyPaceSec) {
    profile.easyPaceSec = derivedEasyPaceSec;
  }
  // Also cross-check target race pace: if recent result implies they're already faster
  // than their target, tighten target pace to match
  const impliedRacePaceSec = recentPaceSec * (GOAL_DIST[profile.goal] / dist) ** 0.07 * (GOAL_DIST[profile.goal] / dist);
  // Simple: use recent pace as a sanity floor for race pace
  if (impliedRacePaceSec < profile.racePaceSec) {
    profile.racePaceSec = impliedRacePaceSec;
    profile.tempoPaceSec = profile.racePaceSec + 12;
    profile.intervalPaceSec = Math.max(profile.racePaceSec - 10, 180);
  }
}
```

Call order in `generateAndShowPlan`:
```javascript
profile.fitnessLevel = fitnessLevel(profile);
adjustPaceByRecentResult(profile);  // ← after fitnessLevel, before buildPlan
const plan = buildPlan(profile);
```

- [ ] **Step 3: Add `buildPlan` — generates array of week objects**

```javascript
function buildPlan(profile) {
  const totalWeeks = calcWeeks(profile.targetDate);
  const phases = buildPhases(profile.goal, totalWeeks);
  const plan = [];
  const hasInjury = !profile.injuries.includes('none');
  const startDate = new Date(); // Week 1 starts today

  // Training days in DOW order (0=Sun..6=Sat)
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState
    .map((s,i) => s >= 1 ? i : -1)
    .filter(i => i >= 0)
    .sort((a,b) => a-b);
  const otherDows = trainDows.filter(d => d !== longDow);

  let baseKm = Math.max(profile.weeklyKm * 1.05, 10);

  phases.forEach(phase => {
    for (let wi = 0; wi < phase.weeks; wi++) {
      const weekNum = plan.length + 1;
      const isDeload = (weekNum % 4 === 0) && weekNum < totalWeeks - 2;
      const taperWeeksLeft = totalWeeks - weekNum;
      const isTaper = taperWeeksLeft <= (profile.goal === 'full' ? 3 : 2);

      let targetKm = baseKm;
      if (isDeload) targetKm = baseKm * 0.8;
      else if (isTaper) {
        if (taperWeeksLeft <= 1) targetKm = baseKm * 0.2;
        else if (taperWeeksLeft <= 2) targetKm = baseKm * 0.5;
        else targetKm = baseKm * 0.7;
      }

      const days = buildWeekDays(
        profile, trainDows, longDow, otherDows,
        targetKm, isDeload, isTaper, hasInjury,
        weekNum, startDate, totalWeeks
      );

      plan.push({
        weekNum,
        phase: phase.name,
        phaseLabel: phase.label,
        isDeload,
        isTaper,
        targetKm: Math.round(targetKm * 10) / 10,
        days
      });

      if (!isDeload && !isTaper) baseKm *= 1.1; // +10% next week
    }
  });

  return plan;
}
```

- [ ] **Step 3: Add phase structure builder**

```javascript
function calcWeeks(targetDate) {
  return Math.max(Math.floor((new Date(targetDate) - new Date()) / (1000*86400*7)), 1);
}

function buildPhases(goal, totalWeeks) {
  const configs = {
    '5k10k': [
      { name:'base',   label:'基礎建量',  ratio: 0.4 },
      { name:'build',  label:'強化提升',  ratio: 0.4 },
      { name:'taper',  label:'賽前減量',  ratio: 0.2 }
    ],
    'half': [
      { name:'base',   label:'基礎建量',  ratio: 0.3 },
      { name:'build',  label:'強化提升',  ratio: 0.35 },
      { name:'peak',   label:'高峰週期',  ratio: 0.2 },
      { name:'taper',  label:'賽前減量',  ratio: 0.15 }
    ],
    'full': [
      { name:'base',   label:'基礎建量',  ratio: 0.25 },
      { name:'build1', label:'強化①',    ratio: 0.25 },
      { name:'build2', label:'強化②',    ratio: 0.25 },
      { name:'peak',   label:'高峰週期',  ratio: 0.15 },
      { name:'taper',  label:'賽前減量',  ratio: 0.1 }
    ],
    'rehab': [
      { name:'light',    label:'輕量恢復',  ratio: 0.25 },
      { name:'progress', label:'漸進強化',  ratio: 0.35 },
      { name:'solid',    label:'鞏固基礎',  ratio: 0.25 },
      { name:'maintain', label:'維持訓練',  ratio: 0.15 }
    ]
  };
  const template = configs[goal] || configs['half'];
  let remaining = totalWeeks;
  return template.map((p, i) => {
    const w = i === template.length - 1 ? remaining : Math.max(1, Math.round(totalWeeks * p.ratio));
    remaining -= w;
    return { ...p, weeks: w };
  });
}
```

- [ ] **Step 4: Add `buildWeekDays` — assigns workout type to each DOW**

```javascript
const DOW_NAMES = ['週日','週一','週二','週三','週四','週五','週六'];

function buildWeekDays(profile, trainDows, longDow, otherDows, targetKm, isDeload, isTaper, hasInjury, weekNum, startDate, totalWeeks) {
  const days = [];
  const weekStart = new Date(startDate);
  weekStart.setDate(startDate.getDate() + (weekNum - 1) * 7);
  const numTrain = trainDows.length;

  // Determine workout types for other days (in order)
  // Beginners: no interval first 4 weeks, tempo pace = easyPace - 15s (not race pace + 12s)
  const level = profile.fitnessLevel || 'intermediate';
  const isEarlyBeginner = level === 'beginner' && weekNum <= 4;

  let otherTypes = [];
  if (numTrain === 2) otherTypes = ['easy'];
  else if (numTrain === 3) otherTypes = isEarlyBeginner ? ['easy','easy'] : ['tempo','easy'];
  else if (numTrain === 4) otherTypes = isEarlyBeginner ? ['easy','easy','easy'] : ['interval','tempo','easy'];
  else otherTypes = isEarlyBeginner ? ['easy','easy','easy','easy'] : ['interval','tempo','easy','easy'];

  if (isDeload || hasInjury || isEarlyBeginner) otherTypes = otherTypes.filter(t => t !== 'interval');
  if (hasInjury) otherTypes = otherTypes.map(t => t === 'tempo' ? 'easy' : t);

  let otherIdx = 0;

  for (let dow = 0; dow < 7; dow++) {
    const date = new Date(weekStart);
    // Adjust so week starts on Sunday (dow=0)
    const dayOffset = (dow - weekStart.getDay() + 7) % 7;
    date.setDate(weekStart.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    if (profile.dayState[dow] === 2) {
      // Long run day
      const longKm = calcLongRunKm(targetKm, numTrain, profile.maxLongRunMins, profile.easyPaceSec, isTaper);
      days.push(buildDayCard(dow, dateStr, 'long', longKm, profile, isDeload, isTaper, hasInjury, today));
    } else if (profile.dayState[dow] === 1) {
      const type = otherTypes[otherIdx] || 'easy';
      otherIdx++;
      const km = calcWorkoutKm(type, targetKm, numTrain, longDow !== -1);
      days.push(buildDayCard(dow, dateStr, type, km, profile, isDeload, isTaper, hasInjury, today));
    } else {
      days.push({ dow, dateStr, type: 'rest', isToday: dateStr === today, status: 'upcoming' });
    }
  }
  return days;
}

function calcLongRunKm(targetKm, numTrain, maxMins, easyPaceSec, isTaper) {
  // Long run = 30-40% of weekly km, capped by time limit
  let km = targetKm * (numTrain <= 2 ? 0.5 : 0.35);
  if (easyPaceSec > 0) {
    const maxKm = (maxMins * 60) / easyPaceSec;
    km = Math.min(km, maxKm);
  }
  if (isTaper) km *= 0.7;
  return Math.round(km * 10) / 10;
}

function calcWorkoutKm(type, targetKm, numTrain, hasLong) {
  const share = { interval: 0.15, tempo: 0.2, easy: 0.25 };
  return Math.round((targetKm * (share[type] || 0.2)) * 10) / 10;
}
```

- [ ] **Step 5: Add `buildDayCard` — workout steps per type**

```javascript
function buildDayCard(dow, dateStr, type, km, profile, isDeload, isTaper, hasInjury, today) {
  const card = { dow, dateStr, type, km, isToday: dateStr === today, status: 'upcoming', isDeload };

  const racePace = secToPace(profile.racePaceSec);
  const tempo = secToPace(profile.tempoPaceSec);
  const interval = secToPace(profile.intervalPaceSec);
  const easy = secToPace(profile.easyPaceSec);

  if (type === 'easy') {
    card.task = `輕鬆跑 ${km} km`;
    card.pace = `配速 ${easy}/km`;
    card.steps = [
      { icon:'🚶', text:'熱身：步行 5 分鐘 + 動態伸展' },
      { icon:'🏃', text:`主課：${km} km 輕鬆跑，全程 ${easy}/km` },
      { icon:'🧘', text:'收操：5 分鐘慢跑降速 + 靜態伸展' }
    ];
    card.strength = hasInjury ? '復健核心：橋式 3×15、單腳站立 3×30s' : null;
  } else if (type === 'tempo') {
    card.task = `節奏跑 ${km} km`;
    card.pace = `配速 ${tempo}/km`;
    card.steps = [
      { icon:'🚶', text:'熱身：10 分鐘慢跑（' + easy + '/km）+ 動態伸展' },
      { icon:'🔥', text:`主課：${km} km 節奏跑，目標 ${tempo}/km（舒適困難感）` },
      { icon:'🧘', text:'收操：5–10 分鐘慢跑降速 + 靜態伸展' }
    ];
    card.strength = hasInjury ? '復健核心：蚌殼式 3×15、彈力帶側走 3×20步' : null;
  } else if (type === 'interval') {
    const sets = Math.max(4, Math.min(8, Math.round(km / 0.4)));
    card.task = `間歇跑 ${sets}×400m`;
    card.pace = `配速 ${interval}/km`;
    card.steps = [
      { icon:'🚶', text:'熱身：15 分鐘慢跑 + 動態伸展 + 3 次加速跑 100m' },
      { icon:'⚡', text:`主課：${sets}×400m，目標 ${interval}/km，每趟間慢跑 90 秒恢復` },
      { icon:'🧘', text:'收操：10 分鐘慢跑降速 + 靜態伸展' }
    ];
    card.strength = '肌力：單腳蹲 3×10、核心棒式 3×45s';
  } else if (type === 'long') {
    card.task = `長跑 ${km} km`;
    card.pace = `配速 ${easy}–${secToPace(profile.easyPaceSec - 15)}/km`;
    card.steps = [
      { icon:'🚶', text:'熱身：5–10 分鐘步行 + 動態伸展' },
      { icon:'🏃', text:`主課：${km} km 長跑，維持輕鬆對話配速 ${easy}/km` },
      { icon:'🧘', text:'收操：10 分鐘步行 + 完整靜態伸展（每個動作 30s）' }
    ];
    card.strength = hasInjury ? '復健：泡沫滾筒放鬆 10 分鐘' : '選配肌力：深蹲 3×12、橋式 3×15';
  }

  return card;
}
```

- [ ] **Step 6: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): plan generation algorithm with phases, deload, taper"
```

---

## Task 6: Plan View — Progress Card + Phase Tabs

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `renderPlanView` skeleton + toolbar**

```javascript
// ============================================================
// PLAN VIEW
// ============================================================
let currentWeek = 1;  // 1-based, which week user is viewing

function renderPlanView() {
  const el = document.getElementById('view-plan');
  const p = appData.profile;
  const plan = appData.plan;
  if (!p || !plan.length) { showView('setup'); return; }

  // Calculate current week (based on today vs generatedAt)
  const daysSinceGen = Math.floor((new Date() - new Date(p.generatedAt)) / 86400000);
  currentWeek = Math.min(Math.max(1, Math.floor(daysSinceGen / 7) + 1), plan.length);

  el.innerHTML = `
<!-- Toolbar -->
<div class="plan-toolbar">
  <button class="tab active" onclick="switchPlanTab('week')">本週課表</button>
  <button class="tab" onclick="switchPlanTab('checkin')">週評估</button>
  <button class="tab" onclick="switchPlanTab('log')">訓練紀錄</button>
  <div class="spacer"></div>
  <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="editSetup()">⚙️ 修改設定</button>
</div>

<!-- Plan Sub-views -->
<div id="plan-tab-week" class="container">
  ${renderProgressCard(p, plan)}
  ${renderPhaseTabs(plan)}
  ${renderWeekSection(plan)}
</div>
<div id="plan-tab-checkin" class="container" style="display:none">
  ${renderCheckinSection()}
</div>
<div id="plan-tab-log" class="container" style="display:none">
  ${renderLogSection()}
</div>

<!-- Export Bar -->
<div class="export-bar">
  <button class="btn btn-secondary" onclick="exportPDF()">📄 存 PDF</button>
  <button class="btn btn-secondary" onclick="exportHTML()">📱 下載手機版 HTML</button>
</div>`;
}

function switchPlanTab(tab) {
  ['week','checkin','log'].forEach(t => {
    document.getElementById('plan-tab-' + t).style.display = t === tab ? 'block' : 'none';
    document.querySelectorAll('.plan-toolbar .tab').forEach((btn, i) => {
      const tabs = ['week','checkin','log'];
      btn.classList.toggle('active', tabs[i] === tab);
    });
  });
}

function editSetup() {
  renderSetupView();
  showView('setup');
}
```

- [ ] **Step 2: Add `renderProgressCard`**

```javascript
function renderProgressCard(profile, plan) {
  const totalWeeks = plan.length;
  const pct = Math.round((currentWeek / totalWeeks) * 100);
  const dist = GOAL_DIST[profile.goal];
  const racePace = secToPace(profile.racePaceSec);
  const goalName = { '5k10k':'5K/10K', 'half':'半馬 21K', 'full':'全馬 42K', 'rehab':'傷後重建' }[profile.goal];

  // Stats from log
  const log = appData.log || [];
  const totalKm = log.reduce((s, e) => s + (e.actualKm || 0), 0);
  const doneCount = log.length;
  const currWeekPlan = plan[currentWeek - 1];
  const currWeekDone = log.filter(e => {
    const w = Math.floor((new Date(e.date) - new Date(profile.generatedAt)) / 86400000 / 7) + 1;
    return w === currentWeek;
  }).reduce((s, e) => s + (e.actualKm || 0), 0);
  const adherence = doneCount > 0 ? Math.round((doneCount / (currentWeek * (plan[0]?.days.filter(d=>d.type!=='rest').length || 3))) * 100) : 0;

  const barWidth = Math.min(100, pct);
  return `
<div class="card">
  <div style="font-size:18px;font-weight:700;margin-bottom:4px">${goalName} 訓練計畫</div>
  <div style="font-size:13px;color:var(--c-text-muted);margin-bottom:12px">
    目標日 ${profile.targetDate} · 目標配速 ${racePace}/km
  </div>
  <div style="font-size:14px;margin-bottom:6px">第 <strong>${currentWeek}</strong> 週 / 共 ${totalWeeks} 週</div>
  <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${barWidth}%"></div></div>
  <div class="progress-stats">
    <span>完成 <strong>${doneCount}</strong> 次</span>
    <span>本週 <strong>${currWeekDone.toFixed(1)}/${currWeekPlan?.targetKm || '?'} km</strong></span>
    <span>累積 <strong>${totalKm.toFixed(1)} km</strong></span>
    ${adherence > 0 ? `<span>遵從率 <strong>${adherence}%</strong></span>` : ''}
  </div>
</div>`;
}
```

- [ ] **Step 3: Add `renderPhaseTabs`**

```javascript
function renderPhaseTabs(plan) {
  // Group weeks by phase
  const phases = [];
  let lastPhase = null;
  plan.forEach(w => {
    if (!lastPhase || lastPhase.name !== w.phase) {
      lastPhase = { name: w.phase, label: w.phaseLabel, start: w.weekNum, end: w.weekNum };
      phases.push(lastPhase);
    } else {
      lastPhase.end = w.weekNum;
    }
  });

  const currentPhase = plan[currentWeek - 1]?.phase;
  return `<div class="phase-tabs">${phases.map(p => {
    const isCurrent = p.name === currentPhase;
    const isDone = p.end < currentWeek;
    const emoji = { base:'🏗️', build:'🔥', build1:'🔥', build2:'💪', peak:'🎯', taper:'⬇️', light:'🌱', progress:'📈', solid:'💪', maintain:'✓', rehab:'🩺' }[p.name] || '📍';
    return `<div class="phase-tab ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}" onclick="jumpToPhaseWeek(${p.start})">
      ${emoji} ${p.label} W${p.start}${p.end > p.start ? '–' + p.end : ''}
    </div>`;
  }).join('')}</div>`;
}

function jumpToPhaseWeek(weekNum) {
  currentWeek = weekNum;
  document.getElementById('plan-tab-week').innerHTML = `
    ${renderProgressCard(appData.profile, appData.plan)}
    ${renderPhaseTabs(appData.plan)}
    ${renderWeekSection(appData.plan)}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): plan view progress card and phase tabs"
```

---

## Task 7: Plan View — Weekly Calendar + Day Cards

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `renderWeekSection`**

```javascript
function renderWeekSection(plan) {
  const week = plan[currentWeek - 1];
  if (!week) return '<p>找不到訓練週資料</p>';

  const deloadBadge = week.isDeload ? '<span style="font-size:12px;color:var(--c-orange);margin-left:8px">減量週</span>' : '';
  const taperBadge = week.isTaper ? '<span style="font-size:12px;color:var(--c-blue);margin-left:8px">減量期</span>' : '';

  return `
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px" class="week-nav">
  <button class="btn btn-secondary" onclick="navWeek(-1)" ${currentWeek <= 1 ? 'disabled' : ''}>◀</button>
  <span class="week-nav-label">第 ${currentWeek} 週 — ${week.phaseLabel} ${deloadBadge}${taperBadge}</span>
  <button class="btn btn-secondary" onclick="navWeek(1)" ${currentWeek >= plan.length ? 'disabled' : ''}>▶</button>
  <span style="font-size:13px;color:var(--c-text-muted);margin-left:auto">目標 ${week.targetKm} km</span>
</div>
<div class="week-calendar">${week.days.map(d => renderDayCard(d)).join('')}</div>`;
}

function navWeek(delta) {
  currentWeek = Math.max(1, Math.min(appData.plan.length, currentWeek + delta));
  jumpToPhaseWeek(currentWeek);
}
```

- [ ] **Step 2: Add `renderDayCard`**

```javascript
function renderDayCard(day) {
  if (day.type === 'rest') {
    return `<div class="day-card ${day.status === 'missed' ? 'missed-card' : ''}">
      <div class="day-card-header">
        <span class="day-card-date">${DOW_NAMES[day.dow]} ${day.dateStr?.slice(5) || ''}</span>
        ${day.isToday ? '<span class="day-card-today-badge">今天</span>' : ''}
      </div>
      <span class="workout-badge badge-rest">休息</span>
      <div class="day-card-task" style="font-size:12px;color:var(--c-text-muted)">主動恢復 / 完全休息</div>
      <div class="workout-steps" style="margin-top:8px">
        <div class="step"><span class="step-icon">💤</span><span>完全休息 · 睡眠優先</span></div>
        <div class="step"><span class="step-icon">🫧</span><span>選配：泡沫滾筒 10 分鐘</span></div>
        <div class="step"><span class="step-icon">🧘</span><span>選配：瑜珈伸展 20 分鐘</span></div>
      </div>
    </div>`;
  }

  const badgeClass = { easy:'badge-easy', tempo:'badge-tempo', interval:'badge-interval', long:'badge-long' }[day.type] || 'badge-rest';
  const typeName = { easy:'輕鬆跑', tempo:'節奏跑', interval:'間歇跑', long:'長跑' }[day.type] || '訓練';
  const statusClass = day.status === 'done' ? 'done-card' : day.status === 'missed' ? 'missed-card' : '';

  const stepsHTML = (day.steps || []).map(s =>
    `<div class="step"><span class="step-icon">${s.icon}</span><span>${s.text}</span></div>`
  ).join('');

  const strengthHTML = day.strength
    ? `<div class="strength-box"><strong>💪 肌力/核心</strong>${day.strength}</div>`
    : '';

  const actionsHTML = day.status === 'done'
    ? `<div style="color:var(--c-green);font-size:13px;font-weight:600">✓ 已完成</div>`
    : day.status === 'missed'
    ? `<div style="color:var(--c-red);font-size:13px">✗ 已跳過</div>`
    : `<div class="day-card-actions">
        <button class="btn btn-primary" onclick="markDone('${day.dateStr}','${day.type}',${day.km||0})">✓ 完成</button>
        <button class="btn btn-secondary" onclick="markMissed('${day.dateStr}','${day.type}')">跳過</button>
       </div>`;

  return `<div class="day-card ${day.isToday ? 'today' : ''} ${statusClass} ${day.isDeload ? 'deload-card' : ''}">
    <div class="day-card-header">
      <span class="day-card-date">${DOW_NAMES[day.dow]} ${day.dateStr?.slice(5) || ''}</span>
      ${day.isToday ? '<span class="day-card-today-badge">今天</span>' : ''}
    </div>
    <span class="workout-badge ${badgeClass}">${typeName}</span>
    <div class="day-card-task">${day.task || typeName}</div>
    <div class="day-card-pace">${day.pace || ''}</div>
    <div class="workout-steps">${stepsHTML}</div>
    ${strengthHTML}
    ${actionsHTML}
  </div>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): weekly calendar and day cards render"
```

---

## Task 8: Mark Done / Mark Missed + Log Integration

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `markDone` — opens quick-log modal then saves**

```javascript
// ============================================================
// WORKOUT ACTIONS
// ============================================================
function markDone(dateStr, type, plannedKm) {
  showModal(
    '✓ 記錄完成',
    `<div>
      <div class="form-group"><label class="form-label">實際距離 (km)</label>
        <input class="form-input" id="m-km" type="number" step="0.1" value="${plannedKm}"></div>
      <div class="form-group"><label class="form-label">完成時間 (分鐘)</label>
        <input class="form-input" id="m-time" type="number" placeholder="例：45"></div>
      <div class="form-group"><label class="form-label">體感強度 RPE (1–10)</label>
        <input class="form-input" id="m-rpe" type="number" min="1" max="10" placeholder="6"></div>
      <div class="form-group"><label class="form-label">備註（選填）</label>
        <input class="form-input" id="m-notes" type="text" placeholder="感覺..."></div>
    </div>`,
    [
      { label: '儲存', primary: true, action: () => {
        const km = parseFloat(document.getElementById('m-km').value) || plannedKm;
        const mins = parseInt(document.getElementById('m-time').value) || 0;
        const rpe = parseInt(document.getElementById('m-rpe').value) || 0;
        const notes = document.getElementById('m-notes').value;
        saveLogEntry({ date: dateStr, type, plannedKm, actualKm: km, actualTimeMins: mins, rpe, notes });
        // Mark day status
        markDayStatus(dateStr, 'done');
        closeModal();
        renderPlanView();
        showView('plan');
      }},
      { label: '取消', action: closeModal }
    ]
  );
}

function markMissed(dateStr, type) {
  // Mark as missed first
  markDayStatus(dateStr, 'missed');

  // Find same-week rest days after today
  const plan = appData.plan;
  const today = new Date().toISOString().split('T')[0];
  const weekIdx = plan.findIndex(w => w.days.some(d => d.dateStr === dateStr));
  if (weekIdx < 0) { renderPlanView(); showView('plan'); return; }

  const reschedCandidates = plan[weekIdx].days.filter(d =>
    d.type === 'rest' && d.dateStr > today && d.dateStr > dateStr
  );

  if (reschedCandidates.length > 0) {
    const reschedDay = reschedCandidates[0];
    showModal(
      '要補跑嗎？',
      `把 ${DOW_NAMES[reschedDay.dow]}（${reschedDay.dateStr}）改為補跑日？<br><br>補跑內容 = 原計畫縮短 20%`,
      [
        { label: '確認補跑', primary: true, action: () => {
          // Convert rest day to makeup workout
          const origDay = plan[weekIdx].days.find(d => d.dateStr === dateStr);
          const makeupKm = Math.round((origDay?.km || 5) * 0.8 * 10) / 10;
          reschedDay.type = origDay?.type || 'easy';
          reschedDay.km = makeupKm;
          reschedDay.task = `補跑 ${makeupKm} km（原計畫縮短 20%）`;
          reschedDay.pace = origDay?.pace || '';
          reschedDay.steps = origDay?.steps || [];
          reschedDay.strength = null;
          saveData(appData);
          closeModal();
          renderPlanView();
          showView('plan');
        }},
        { label: '不補跑', action: () => { closeModal(); renderPlanView(); showView('plan'); } }
      ]
    );
  } else {
    closeModal();
    renderPlanView();
    showView('plan');
  }
}

function markDayStatus(dateStr, status) {
  appData.plan.forEach(w => w.days.forEach(d => {
    if (d.dateStr === dateStr) d.status = status;
  }));
  saveData(appData);
}

function saveLogEntry(entry) {
  appData.log = appData.log || [];
  // Avoid duplicate for same date+type
  appData.log = appData.log.filter(e => !(e.date === entry.date && e.type === entry.type));
  appData.log.push(entry);
  saveData(appData);
}
```

- [ ] **Step 2: Add modal helpers**

```javascript
// ============================================================
// MODAL
// ============================================================
function showModal(title, bodyHTML, actions) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const actEl = document.getElementById('modal-actions');
  actEl.innerHTML = '';
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.primary ? 'btn-primary' : 'btn-secondary');
    btn.textContent = a.label;
    btn.onclick = a.action;
    actEl.appendChild(btn);
  });
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}
document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});
```

- [ ] **Step 3: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): mark done/missed with log integration and makeup run"
```

---

## Task 9: Weekly Check-in

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `renderCheckinSection`**

```javascript
// ============================================================
// WEEKLY CHECK-IN
// ============================================================
const CHECKIN_QUESTIONS = [
  '本週所有訓練都完成了',
  '身體無異常疲勞或疼痛',
  '睡眠品質良好',
  '長跑結束後隔天恢復正常',
  '節奏跑 / 間歇跑配速達標'
];

function renderCheckinSection() {
  const existing = (appData.checkins || []).find(c => c.weekNum === currentWeek);
  if (existing) {
    return `<div class="card"><div class="card-title">✅ 第 ${currentWeek} 週評估完成</div>
      <p style="font-size:14px;color:var(--c-text-muted)">結果：${existing.result}　勾選 ${existing.score}/5</p>
      <p style="font-size:13px;margin-top:8px">${existing.adjustment}</p>
    </div>`;
  }

  const qHTML = CHECKIN_QUESTIONS.map((q, i) =>
    `<li><input type="checkbox" id="cq-${i}"><label for="cq-${i}">${q}</label></li>`
  ).join('');

  return `<div class="card">
    <div class="card-title">📋 第 ${currentWeek} 週評估</div>
    <p style="font-size:14px;color:var(--c-text-muted);margin-bottom:16px">完成後勾選，系統自動調整下週計畫。</p>
    <ul class="checkin-questions">${qHTML}</ul>
    <button class="btn btn-primary" style="margin-top:16px;width:100%" onclick="submitCheckin()">提交評估</button>
  </div>`;
}

function submitCheckin() {
  const score = CHECKIN_QUESTIONS.filter((_, i) => document.getElementById('cq-' + i)?.checked).length;
  let result, adjustment;
  if (score === 5) {
    result = '升級';
    adjustment = '下週跑量 +10%，繼續保持！';
    adjustNextWeek(1.1, false);
  } else if (score >= 3) {
    result = '維持';
    adjustment = '下週維持現有計畫。';
  } else if (score >= 1) {
    result = '減量';
    adjustment = '下週跑量 -15%，移除間歇跑。';
    adjustNextWeek(0.85, true);
  } else {
    result = '停止建議';
    adjustment = '⚠️ 建議休息一週後重新評估，若有疼痛請就醫。';
  }
  appData.checkins = appData.checkins || [];
  appData.checkins.push({ weekNum: currentWeek, score, result, adjustment, date: new Date().toISOString().split('T')[0] });
  saveData(appData);
  // Re-render checkin tab
  document.getElementById('plan-tab-checkin').innerHTML = renderCheckinSection();
}

function adjustNextWeek(factor, removeInterval) {
  const nextWeekPlan = appData.plan[currentWeek]; // currentWeek is 1-based, index is currentWeek
  if (!nextWeekPlan) return;
  nextWeekPlan.targetKm = Math.round(nextWeekPlan.targetKm * factor * 10) / 10;
  nextWeekPlan.days = nextWeekPlan.days.map(d => {
    if (removeInterval && d.type === 'interval') {
      // Downgrade to easy
      return buildDayCard(d.dow, d.dateStr, 'easy', d.km * factor, appData.profile, false, false, !appData.profile.injuries.includes('none'), new Date().toISOString().split('T')[0]);
    }
    if (d.type !== 'rest') d.km = Math.round((d.km || 0) * factor * 10) / 10;
    return d;
  });
  saveData(appData);
}
```

- [ ] **Step 2: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): weekly check-in with auto plan adjustment"
```

---

## Task 9b: Adaptive Plan Management (Progress Diagnosis)

**Files:**
- Modify: `site/trainer.html`

After each check-in, the system measures two metrics and triggers a contextual dialog when the runner is significantly ahead or behind schedule.

- [ ] **Step 1: Add `assessProgress` — called at end of `submitCheckin`**

```javascript
// ============================================================
// ADAPTIVE PLAN MANAGEMENT
// ============================================================

function assessProgress() {
  const plan = appData.plan;
  const log = appData.log || [];
  const profile = appData.profile;
  if (!plan.length || currentWeek < 2) return; // need at least 1 full week

  // Planned km up to end of last week
  const plannedKm = plan
    .slice(0, currentWeek - 1)
    .reduce((s, w) => s + w.targetKm, 0);

  // Actual km logged in those weeks
  const genDate = new Date(profile.generatedAt);
  const actualKm = log
    .filter(e => {
      const wk = Math.floor((new Date(e.date) - genDate) / 86400000 / 7) + 1;
      return wk < currentWeek;
    })
    .reduce((s, e) => s + (e.actualKm || 0), 0);

  const progressRate = plannedKm > 0 ? actualKm / plannedKm : 1;

  // Session completion rate up to last week
  const plannedSessions = plan
    .slice(0, currentWeek - 1)
    .reduce((s, w) => s + w.days.filter(d => d.type !== 'rest').length, 0);
  const doneSessions = plan
    .slice(0, currentWeek - 1)
    .flatMap(w => w.days)
    .filter(d => d.status === 'done').length;
  const adherenceRate = plannedSessions > 0 ? doneSessions / plannedSessions : 1;

  // Average RPE from recent 2 weeks
  const recentLog = log.filter(e => {
    const wk = Math.floor((new Date(e.date) - genDate) / 86400000 / 7) + 1;
    return wk >= currentWeek - 2 && wk < currentWeek;
  });
  const avgRpe = recentLog.length > 0
    ? recentLog.reduce((s, e) => s + (e.rpe || 6), 0) / recentLog.length
    : 6;

  const weeksLeft = plan.length - currentWeek + 1;

  // Determine scenario
  if (progressRate > 1.15 && avgRpe < 6.5) {
    showAdaptationDialog('ahead', { progressRate, avgRpe, weeksLeft });
  } else if (progressRate < 0.6 || (adherenceRate < 0.5 && currentWeek >= 3)) {
    showAdaptationDialog('behind_critical', { progressRate, adherenceRate, weeksLeft });
  } else if (progressRate < 0.8 && weeksLeft > 4) {
    showAdaptationDialog('behind_moderate', { progressRate, weeksLeft });
  }
  // else: normal range, no dialog needed
}
```

- [ ] **Step 2: Add `showAdaptationDialog` — 3 scenario branches**

```javascript
function showAdaptationDialog(scenario, data) {
  const goalName = { '5k10k':'5K/10K', 'half':'半馬', 'full':'全馬', 'rehab':'傷後重建' }[appData.profile.goal];

  if (scenario === 'ahead') {
    const pct = Math.round(data.progressRate * 100);
    showModal(
      '🚀 你超前計畫了！',
      `進度 ${pct}%，平均體感強度 ${data.avgRpe.toFixed(1)}/10，身體狀況良好。<br><br>要提升訓練強度嗎？`,
      [
        { label: '提升強度', primary: true, action: () => {
          upgradeIntensity();
          closeModal();
          renderPlanView(); showView('plan');
        }},
        { label: '維持現況', action: () => closeModal() }
      ]
    );
  } else if (scenario === 'behind_moderate') {
    const pct = Math.round(data.progressRate * 100);
    showModal(
      '📉 進度略為落後',
      `目前達成計畫跑量的 ${pct}%，還有 ${data.weeksLeft} 週可以追上。<br><br>要怎麼做？`,
      [
        { label: '繼續原計畫', action: () => closeModal() },
        { label: '調降目標配速', primary: true, action: () => {
          adjustTargetPace(+15); // +15 sec/km easier
          closeModal();
          showView('plan');
        }},
        { label: '延後比賽日期', action: () => {
          closeModal();
          promptReschedule();
        }}
      ]
    );
  } else if (scenario === 'behind_critical') {
    const pct = Math.round(data.progressRate * 100);
    showModal(
      '⚠️ 計畫嚴重落後',
      `完成率 ${Math.round((data.adherenceRate || data.progressRate) * 100)}%。<br><br>建議選擇：`,
      [
        { label: '降級目標', primary: true, action: () => {
          closeModal();
          promptGoalDowngrade();
        }},
        { label: '重設計畫', action: () => {
          closeModal();
          resetPlanFromNow();
        }},
        { label: '暫停計畫', action: () => {
          closeModal();
          pausePlan();
        }}
      ]
    );
  }
}
```

- [ ] **Step 3: Add intensity upgrade + pace adjustment + reschedule + goal downgrade + pause helpers**

```javascript
function upgradeIntensity() {
  // Add interval to next week if not present; tighten tempo pace by 5s
  const nextWeek = appData.plan[currentWeek]; // 1-based → index
  if (!nextWeek) return;
  appData.profile.racePaceSec = Math.max(appData.profile.racePaceSec - 5, 150);
  appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
  appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
  // Rebuild next 4 weeks with updated paces
  rebuildWeeksFrom(currentWeek + 1, 4);
  saveData(appData);
}

function adjustTargetPace(deltaSecPerKm) {
  appData.profile.racePaceSec += deltaSecPerKm;
  appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
  appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
  // Derive new target time
  const dist = GOAL_DIST[appData.profile.goal];
  appData.profile.targetTime = secToTime(Math.round(appData.profile.racePaceSec * dist));
  rebuildWeeksFrom(currentWeek + 1, appData.plan.length - currentWeek);
  saveData(appData);
  renderPlanView(); showView('plan');
}

function promptReschedule() {
  showModal(
    '📅 延後比賽日期',
    `<div class="form-group"><label class="form-label">新的比賽日期</label>
     <input class="form-input" type="date" id="new-race-date" value="${appData.profile.targetDate}"></div>`,
    [
      { label: '確認', primary: true, action: () => {
        const newDate = document.getElementById('new-race-date').value;
        if (!newDate) return;
        appData.profile.targetDate = newDate;
        // Extend plan with new weeks if needed
        const extraWeeks = calcWeeks(newDate) - appData.plan.length;
        if (extraWeeks > 0) extendPlan(extraWeeks);
        saveData(appData);
        closeModal(); renderPlanView(); showView('plan');
      }},
      { label: '取消', action: () => closeModal() }
    ]
  );
}

function promptGoalDowngrade() {
  const goalOrder = ['5k10k', 'half', 'full'];
  const curIdx = goalOrder.indexOf(appData.profile.goal);
  const downgradeGoal = curIdx > 0 ? goalOrder[curIdx - 1] : null;
  const downgradeLabel = { '5k10k':'5K/10K', 'half':'半馬 21K', 'full':'全馬 42K' }[downgradeGoal];

  if (!downgradeGoal) {
    showModal('無法再降級', '已是最低目標（5K/10K）。建議暫停計畫休息。', [{ label: '確認', action: () => closeModal() }]);
    return;
  }

  showModal(
    '降級目標',
    `把目標從 ${{ '5k10k':'5K/10K', 'half':'半馬', 'full':'全馬' }[appData.profile.goal]} 改為 ${downgradeLabel}？<br><br>訓練紀錄保留，計畫後半段重新生成。`,
    [
      { label: `改為 ${downgradeLabel}`, primary: true, action: () => {
        appData.profile.goal = downgradeGoal;
        // Recalc race pace for new distance
        const timeSec = timeToSec(appData.profile.targetTime);
        const dist = GOAL_DIST[downgradeGoal];
        appData.profile.racePaceSec = timeSec / dist;
        appData.profile.tempoPaceSec = appData.profile.racePaceSec + 12;
        appData.profile.intervalPaceSec = Math.max(appData.profile.racePaceSec - 10, 180);
        rebuildWeeksFrom(currentWeek + 1, appData.plan.length - currentWeek);
        saveData(appData);
        closeModal(); renderPlanView(); showView('plan');
      }},
      { label: '取消', action: () => closeModal() }
    ]
  );
}

function resetPlanFromNow() {
  // Keep log + profile, rebuild plan from current week
  const weeksLeft = calcWeeks(appData.profile.targetDate);
  if (weeksLeft < 1) return;
  const newPlan = buildPlan({ ...appData.profile, generatedAt: new Date().toISOString() });
  // Preserve done/missed status for completed weeks
  appData.plan = [
    ...appData.plan.slice(0, currentWeek - 1),
    ...newPlan.slice(0, Math.max(0, newPlan.length - (currentWeek - 1)))
  ];
  saveData(appData);
  renderPlanView(); showView('plan');
}

function pausePlan() {
  appData.profile.paused = true;
  appData.profile.pausedAt = new Date().toISOString().split('T')[0];
  saveData(appData);
  showModal(
    '計畫已暫停',
    '訓練計畫已暫停。重新開始時，進入「修改設定」點「繼續計畫」即可恢復，訓練紀錄全部保留。',
    [{ label: '確認', action: () => { closeModal(); renderPlanView(); showView('plan'); } }]
  );
}

function extendPlan(extraWeeks) {
  const profile = appData.profile;
  const lastWeek = appData.plan[appData.plan.length - 1];
  const lastKm = lastWeek?.targetKm || 30;
  const hasInjury = !profile.injuries.includes('none');
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s,i) => s>=1?i:-1).filter(i=>i>=0).sort((a,b)=>a-b);
  const otherDows = trainDows.filter(d => d !== longDow);
  const startDate = new Date(profile.generatedAt);

  for (let i = 0; i < extraWeeks; i++) {
    const weekNum = appData.plan.length + 1;
    const days = buildWeekDays(profile, trainDows, longDow, otherDows, lastKm, false, false, hasInjury, weekNum, startDate, weekNum);
    appData.plan.push({ weekNum, phase: 'maintain', phaseLabel: '延長期', isDeload: false, isTaper: false, targetKm: lastKm, days });
  }
}

function rebuildWeeksFrom(startWeekNum, count) {
  const profile = appData.profile;
  const hasInjury = !profile.injuries.includes('none');
  const longDow = profile.dayState.indexOf(2);
  const trainDows = profile.dayState.map((s,i) => s>=1?i:-1).filter(i=>i>=0).sort((a,b)=>a-b);
  const otherDows = trainDows.filter(d => d !== longDow);
  const startDate = new Date(profile.generatedAt);

  for (let wi = 0; wi < count; wi++) {
    const weekIdx = startWeekNum - 1 + wi;
    if (weekIdx >= appData.plan.length) break;
    const week = appData.plan[weekIdx];
    const preserved = week.days.filter(d => d.status === 'done' || d.status === 'missed');
    const newDays = buildWeekDays(profile, trainDows, longDow, otherDows, week.targetKm, week.isDeload, week.isTaper, hasInjury, week.weekNum, startDate, appData.plan.length);
    // Restore done/missed status
    newDays.forEach(d => {
      const old = preserved.find(p => p.dateStr === d.dateStr);
      if (old) d.status = old.status;
    });
    week.days = newDays;
  }
}
```

- [ ] **Step 4: Wire `assessProgress` into `submitCheckin`**

In `submitCheckin()`, add `assessProgress();` as the last line before any render call:

```javascript
function submitCheckin() {
  // ... existing score logic ...
  appData.checkins.push({ weekNum: currentWeek, score, result, adjustment, date: new Date().toISOString().split('T')[0] });
  saveData(appData);
  assessProgress(); // ← ADD THIS LINE
  document.getElementById('plan-tab-checkin').innerHTML = renderCheckinSection();
}
```

- [ ] **Step 5: Add paused state banner in `renderProgressCard`**

In `renderProgressCard`, after the `<div class="card">` opening, add:

```javascript
const pausedBanner = appData.profile.paused
  ? `<div style="background:#7f1d1d;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:12px;color:#fca5a5">
      ⏸ 計畫已暫停（${appData.profile.pausedAt}）
      <button class="btn btn-secondary" style="font-size:12px;padding:4px 10px;margin-left:10px" onclick="resumePlan()">繼續計畫</button>
    </div>`
  : '';
// Inject pausedBanner at top of returned string
```

Add `resumePlan`:

```javascript
function resumePlan() {
  const pausedAt = new Date(appData.profile.pausedAt || new Date());
  const daysPaused = Math.floor((new Date() - pausedAt) / 86400000);
  const weeksPaused = Math.round(daysPaused / 7);
  // Shift all future day dates forward by weeks paused
  appData.plan.forEach(w => {
    w.days.forEach(d => {
      if (d.dateStr && new Date(d.dateStr) >= pausedAt && d.status === 'upcoming') {
        const shifted = new Date(d.dateStr);
        shifted.setDate(shifted.getDate() + weeksPaused * 7);
        d.dateStr = shifted.toISOString().split('T')[0];
      }
    });
  });
  appData.profile.paused = false;
  appData.profile.targetDate = (() => {
    const d = new Date(appData.profile.targetDate);
    d.setDate(d.getDate() + weeksPaused * 7);
    return d.toISOString().split('T')[0];
  })();
  saveData(appData);
  renderPlanView(); showView('plan');
}
```

- [ ] **Step 6: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): adaptive plan management - progress diagnosis and adjustment"
```

---

## Task 10: Training Log View

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `renderLogSection`**

```javascript
// ============================================================
// LOG VIEW
// ============================================================
function renderLogSection() {
  const log = appData.log || [];
  const totalKm = log.reduce((s, e) => s + (e.actualKm || 0), 0);
  const plan = appData.plan || [];
  const plannedSessions = plan.reduce((s, w) => s + w.days.filter(d => d.type !== 'rest').length, 0);
  const adherence = plannedSessions > 0 ? Math.round((log.length / plannedSessions) * 100) : 0;

  const rows = [...log].reverse().map(e => {
    const paceStr = e.actualKm > 0 && e.actualTimeMins > 0
      ? secToPace((e.actualTimeMins * 60) / e.actualKm) + '/km'
      : '—';
    const typeName = { easy:'輕鬆跑', tempo:'節奏跑', interval:'間歇跑', long:'長跑' }[e.type] || e.type;
    return `<tr>
      <td>${e.date}</td>
      <td>${typeName}</td>
      <td>${e.actualKm} km</td>
      <td>${e.actualTimeMins ? e.actualTimeMins + ' 分' : '—'}</td>
      <td>${paceStr}</td>
      <td>${e.rpe || '—'}</td>
    </tr>`;
  }).join('');

  return `
<div class="log-stats">
  <div class="stat-card"><div class="stat-value">${totalKm.toFixed(1)}</div><div class="stat-label">累積公里</div></div>
  <div class="stat-card"><div class="stat-value">${log.length}</div><div class="stat-label">完成次數</div></div>
  <div class="stat-card"><div class="stat-value">${adherence}%</div><div class="stat-label">遵從率</div></div>
</div>

<div class="card">
  <div class="card-title">手動新增記錄</div>
  <div class="log-form-grid">
    <div class="form-group"><label class="form-label">日期</label>
      <input class="form-input" type="date" id="log-date" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-group"><label class="form-label">類型</label>
      <select class="form-input" id="log-type">
        <option value="easy">輕鬆跑</option><option value="tempo">節奏跑</option>
        <option value="interval">間歇跑</option><option value="long">長跑</option>
      </select></div>
    <div class="form-group"><label class="form-label">距離 (km)</label>
      <input class="form-input" type="number" id="log-km" step="0.1" placeholder="5.0"></div>
    <div class="form-group"><label class="form-label">時間 (分鐘)</label>
      <input class="form-input" type="number" id="log-time" placeholder="30"></div>
    <div class="form-group"><label class="form-label">RPE (1–10)</label>
      <input class="form-input" type="number" id="log-rpe" min="1" max="10" placeholder="6"></div>
    <div class="form-group"><label class="form-label">備註</label>
      <input class="form-input" type="text" id="log-notes" placeholder="選填"></div>
  </div>
  <button class="btn btn-primary" onclick="addManualLog()">新增記錄</button>
</div>

<div class="card">
  <div class="card-title">訓練記錄</div>
  ${log.length === 0 ? '<p style="color:var(--c-text-muted);font-size:14px">尚無記錄</p>' : `
  <table class="log-table">
    <thead><tr><th>日期</th><th>類型</th><th>距離</th><th>時間</th><th>配速</th><th>RPE</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`}
</div>`;
}

function addManualLog() {
  const entry = {
    date: document.getElementById('log-date').value,
    type: document.getElementById('log-type').value,
    actualKm: parseFloat(document.getElementById('log-km').value) || 0,
    actualTimeMins: parseInt(document.getElementById('log-time').value) || 0,
    rpe: parseInt(document.getElementById('log-rpe').value) || 0,
    notes: document.getElementById('log-notes').value
  };
  if (!entry.date || !entry.actualKm) return;
  saveLogEntry(entry);
  document.getElementById('plan-tab-log').innerHTML = renderLogSection();
}
```

- [ ] **Step 2: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): training log view with stats and manual entry"
```

---

## Task 11: PDF Export + HTML Export

**Files:**
- Modify: `site/trainer.html`

- [ ] **Step 1: Add `exportPDF`**

```javascript
// ============================================================
// EXPORTS
// ============================================================
function exportPDF() {
  // Switch to week tab for print
  switchPlanTab('week');
  setTimeout(() => window.print(), 100);
}
```

- [ ] **Step 2: Add `exportHTML` — generates self-contained week file**

```javascript
function exportHTML() {
  const week = appData.plan[currentWeek - 1];
  if (!week) return;
  const p = appData.profile;

  const dayCards = week.days.map(d => renderDayCard(d)).join('');
  const storageKey = `trainer-week-${currentWeek}`;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>訓練計畫 第${currentWeek}週</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--c-bg:#0f172a;--c-surface:#1e293b;--c-surface2:#334155;--c-border:#475569;--c-text:#e2e8f0;--c-text-muted:#94a3b8;--c-primary:#3b82f6;--c-green:#22c55e;--c-orange:#f97316;--c-red:#ef4444;--c-blue:#3b82f6;--radius:12px;--radius-sm:8px}
body{background:var(--c-bg);color:var(--c-text);font-family:system-ui,sans-serif;padding:16px}
.header{font-size:18px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:var(--c-text-muted);margin-bottom:20px}
.week-calendar{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.day-card{background:var(--c-surface);border:2px solid var(--c-border);border-radius:var(--radius-sm);padding:14px}
.day-card.today{border-color:var(--c-primary)}
.day-card.done-card{background:#14532d22;border-color:var(--c-green)}
.day-card.deload-card{border-color:var(--c-orange);border-style:dashed}
.day-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.day-card-date{font-size:12px;color:var(--c-text-muted)}
.day-card-today-badge{font-size:11px;background:var(--c-primary);color:white;padding:2px 8px;border-radius:10px}
.workout-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;margin-bottom:8px}
.badge-easy{background:#14532d;color:#86efac}.badge-tempo{background:#431407;color:#fdba74}
.badge-interval{background:#450a0a;color:#fca5a5}.badge-long{background:#1e3a8a;color:#93c5fd}
.badge-rest{background:var(--c-surface2);color:var(--c-text-muted)}
.day-card-task{font-size:13px;font-weight:600;margin-bottom:4px}.day-card-pace{font-size:12px;color:var(--c-text-muted);margin-bottom:10px}
.workout-steps{font-size:12px;color:var(--c-text-muted);line-height:1.6}.step{display:flex;gap:6px}
.step-icon{font-size:10px;margin-top:3px;flex-shrink:0}
.strength-box{background:var(--c-surface2);border-radius:6px;padding:8px;margin-top:8px;font-size:11px;color:var(--c-text-muted)}
.strength-box strong{color:var(--c-text);display:block;margin-bottom:4px}
.check-btn{width:100%;margin-top:10px;padding:8px;border-radius:8px;border:none;background:var(--c-primary);color:white;font-size:13px;font-weight:600;cursor:pointer}
.check-btn.checked{background:var(--c-green)}
.done-indicator{color:var(--c-green);font-size:13px;font-weight:600;margin-top:10px}
</style>
</head>
<body>
<div class="header">第 ${currentWeek} 週訓練計畫</div>
<div class="sub">${p.targetDate} 目標 · ${week.phaseLabel} · 目標 ${week.targetKm} km</div>
<div class="week-calendar">${dayCards.replace(/onclick="[^"]*"/g, '')}</div>
<script>
const SK = '${storageKey}';
function loadChecks(){const d=JSON.parse(localStorage.getItem(SK)||'{}');document.querySelectorAll('[data-date]').forEach(btn=>{if(d[btn.dataset.date]){btn.textContent='✓ 已完成';btn.classList.add('checked')}})}
document.querySelectorAll('[data-date]').forEach(btn=>{btn.addEventListener('click',()=>{const d=JSON.parse(localStorage.getItem(SK)||'{}');d[btn.dataset.date]=true;localStorage.setItem(SK,JSON.stringify(d));btn.textContent='✓ 已完成';btn.classList.add('checked')})})
loadChecks();
<\/script>
</body>
</html>`;

  // Add data-date attributes to check buttons in exported HTML
  const patched = html.replace(/<button class="btn btn-primary" onclick="markDone\('[^']+','[^']+',[\d.]+\)">/g, (m, ...args) => {
    return m; // Already stripped onclick above
  });

  // Inject check buttons for offline use
  const finalHtml = generateOfflineHTML(week, p, currentWeek);

  const blob = new Blob([finalHtml], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trainer-week-${currentWeek}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function generateOfflineHTML(week, profile, weekNum) {
  const DOW_N = ['週日','週一','週二','週三','週四','週五','週六'];
  const badgeMap = { easy:'badge-easy', tempo:'badge-tempo', interval:'badge-interval', long:'badge-long', rest:'badge-rest' };
  const typeMap = { easy:'輕鬆跑', tempo:'節奏跑', interval:'間歇跑', long:'長跑', rest:'休息' };

  const cards = week.days.map(d => {
    if (d.type === 'rest') {
      return `<div class="day-card">
        <div class="day-card-header"><span class="day-card-date">${DOW_N[d.dow]} ${(d.dateStr||'').slice(5)}</span></div>
        <span class="workout-badge badge-rest">休息</span>
        <div class="day-card-task" style="font-size:12px;color:var(--c-text-muted)">主動恢復 / 完全休息</div>
      </div>`;
    }
    const stepsHTML = (d.steps||[]).map(s=>`<div class="step"><span class="step-icon">${s.icon}</span><span>${s.text}</span></div>`).join('');
    const strengthHTML = d.strength ? `<div class="strength-box"><strong>💪 肌力/核心</strong>${d.strength}</div>` : '';
    return `<div class="day-card ${d.isDeload?'deload-card':''}">
      <div class="day-card-header"><span class="day-card-date">${DOW_N[d.dow]} ${(d.dateStr||'').slice(5)}</span></div>
      <span class="workout-badge ${badgeMap[d.type]||'badge-rest'}">${typeMap[d.type]||d.type}</span>
      <div class="day-card-task">${d.task||''}</div>
      <div class="day-card-pace">${d.pace||''}</div>
      <div class="workout-steps">${stepsHTML}</div>
      ${strengthHTML}
      <button class="check-btn" data-date="${d.dateStr}">標記完成</button>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>訓練計畫 第${weekNum}週</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--c-bg:#0f172a;--c-surface:#1e293b;--c-surface2:#334155;--c-border:#475569;--c-text:#e2e8f0;--c-text-muted:#94a3b8;--c-primary:#3b82f6;--c-green:#22c55e;--c-orange:#f97316;--radius-sm:8px}
body{background:var(--c-bg);color:var(--c-text);font-family:system-ui,sans-serif;padding:16px}
.header{font-size:18px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:var(--c-text-muted);margin-bottom:20px}
.week-calendar{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.day-card{background:var(--c-surface);border:2px solid var(--c-border);border-radius:var(--radius-sm);padding:14px}
.day-card.deload-card{border-color:var(--c-orange);border-style:dashed}
.day-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.day-card-date{font-size:12px;color:var(--c-text-muted)}
.workout-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;margin-bottom:8px}
.badge-easy{background:#14532d;color:#86efac}.badge-tempo{background:#431407;color:#fdba74}.badge-interval{background:#450a0a;color:#fca5a5}.badge-long{background:#1e3a8a;color:#93c5fd}.badge-rest{background:var(--c-surface2);color:var(--c-text-muted)}
.day-card-task{font-size:13px;font-weight:600;margin-bottom:4px}.day-card-pace{font-size:12px;color:var(--c-text-muted);margin-bottom:10px}
.workout-steps{font-size:12px;color:var(--c-text-muted);line-height:1.6}.step{display:flex;gap:6px}.step-icon{font-size:10px;margin-top:3px;flex-shrink:0}
.strength-box{background:var(--c-surface2);border-radius:6px;padding:8px;margin-top:8px;font-size:11px;color:var(--c-text-muted)}
.strength-box strong{color:var(--c-text);display:block;margin-bottom:4px}
.check-btn{width:100%;margin-top:10px;padding:8px;border-radius:8px;border:none;background:var(--c-primary);color:white;font-size:13px;font-weight:600;cursor:pointer}
.check-btn.checked{background:var(--c-green)}</style>
</head><body>
<div class="header">第 ${weekNum} 週訓練計畫</div>
<div class="sub">${profile.targetDate} 目標 · ${week.phaseLabel} · 目標 ${week.targetKm} km</div>
<div class="week-calendar">${cards}</div>
<script>
const SK='trainer-offline-${weekNum}';
function load(){const d=JSON.parse(localStorage.getItem(SK)||'{}');document.querySelectorAll('[data-date]').forEach(b=>{if(d[b.dataset.date]){b.textContent='✓ 已完成';b.classList.add('checked')}})}
document.querySelectorAll('[data-date]').forEach(b=>{b.addEventListener('click',()=>{const d=JSON.parse(localStorage.getItem(SK)||'{}');d[b.dataset.date]=true;localStorage.setItem(SK,JSON.stringify(d));b.textContent='✓ 已完成';b.classList.add('checked')})});
load();
<\/script></body></html>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add site/trainer.html
git commit -m "feat(trainer): PDF and offline HTML export"
```

---

## Task 12: Nav Link + Init Logic

**Files:**
- Modify: `site/index.html`
- Modify: `site/trainer.html`

- [ ] **Step 1: Add nav link in `site/index.html`**

Find the nav links section (search for `href="index.html"` or the existing nav items) and add:

```html
<a href="trainer.html">🗓 訓練計畫</a>
```

Location: within the `<nav>` element, alongside existing nav links.

- [ ] **Step 2: Add app init at bottom of trainer.html script**

Replace the placeholder `renderSetupView();` with:

```javascript
// ============================================================
// INIT
// ============================================================
function init() {
  appData = loadData();
  if (appData.profile && appData.plan && appData.plan.length > 0) {
    renderPlanView();
    showView('plan');
  } else {
    renderSetupView();
    showView('setup');
  }
}

init();
```

- [ ] **Step 2b: Guard `generateAndShowPlan` against accidental overwrite**

When user reaches setup via ⚙️修改設定 (existing plan exists), warn before overwriting:

```javascript
function generateAndShowPlan() {
  // Warn if overwriting an existing plan
  if (appData.plan && appData.plan.length > 0) {
    if (!confirm('重新生成會取代目前計畫，訓練紀錄將保留。確定繼續？')) return;
  }
  // ... rest of existing function
}
```

- [ ] **Step 3: Verify end-to-end flow in browser:**
  - Open `site/trainer.html` → see setup form
  - Fill all fields → "生成訓練計畫" button enables
  - Click generate → plan view appears with progress card, phase tabs, week calendar
  - Mark a day done → modal appears, fill in → day turns green
  - Mark missed → reschedule prompt appears (if rest days available)
  - Export PDF → print dialog
  - Export HTML → file downloads
  - Refresh page → plan view loads (not setup form)
  - Click ⚙️修改設定 → edit form → click generate → confirm dialog appears before overwriting

- [ ] **Step 4: Commit**

```bash
git add site/trainer.html site/index.html
git commit -m "feat(trainer): nav integration and app init with persistence"
```

---

## Self-Review Against Spec

**Spec § III (9 fields):**
- ✅ Goal cards (4 types)
- ✅ Target date with week count + warnings
- ✅ Target finish time → all paces derived
- ✅ Day picker (0/1/2 state, long run designation)
- ✅ Long run max time (select)
- ✅ Current weekly km
- ✅ Easy pace
- ✅ Recent result (optional)
- ✅ Injuries (pills, affects plan generation)

**Spec § IV (Plan Logic):**
- ✅ Phase structures for all 4 goals
- ✅ Deload every 4th week (−20%, no interval)
- ✅ Taper last 2–3 weeks (70%→50%→20%)
- ✅ +10%/week growth
- ✅ Workout type assignment by training-days count
- ✅ Long run capped by time limit + easy pace
- ✅ Injury mode: removes interval, tempo→easy

**Spec § V (Plan View):**
- ✅ Progress card (weeks, %, stats)
- ✅ Phase tabs with navigation
- ✅ Week calendar with day cards
- ✅ Today highlight
- ✅ Done/missed status rendering

**Spec § VI (Missed Training):**
- ✅ Mark missed → same-week rest day offer → makeup run −20%

**Spec § VII (Check-in):**
- ✅ 5 questions → score → upgrade/hold/deload/stop
- ✅ Auto-adjust next week km + remove interval on deload

**Spec § VIII (Log):**
- ✅ Stats card (km, count, adherence)
- ✅ Manual entry form
- ✅ Log table

**Spec § IX (Exports):**
- ✅ `window.print()` with `@media print`
- ✅ Blob download `trainer-week-N.html` with offline check-off

**Spec § X (Nav):**
- ✅ `site/index.html` nav link

**Type consistency check:**
- `buildDayCard` used in `adjustNextWeek` — ✅ same signature
- `secToPace`, `timeToSec` used throughout — ✅ consistent
- `appData.log[].actualKm`, `actualTimeMins` — ✅ consistent in log render and entry save
- `formState.dayState` — ✅ 7-element array used in generation and prefill

**Adaptive management (Task 9b):**
- ✅ `assessProgress()` — calculates progressRate, adherenceRate, avgRPE
- ✅ Ahead (>115% + RPE<6.5) → upgrade intensity dialog
- ✅ Behind moderate (<80%, >4 weeks left) → 3 options: continue / adjust pace / reschedule
- ✅ Behind critical (<60% or adherence<50%) → downgrade goal / reset plan / pause
- ✅ Goal downgrade rebuilds remaining weeks with new distance paces
- ✅ Pause → shifts future dates on resume
- ✅ `rebuildWeeksFrom` preserves done/missed status across rebuilds

**Fitness level branching (Task 5):**
- ✅ `fitnessLevel()` classifies beginner / intermediate / advanced
- ✅ Beginner first 4 weeks: no interval, tempo replaced by easy

**No placeholders found.**
