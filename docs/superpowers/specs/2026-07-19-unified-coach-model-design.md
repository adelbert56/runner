# 統一教練模型 — 設計規格

> 日期：2026-07-19　狀態：**待使用者審**（審過才進實作計畫）
> 目標：把散亂的 6 個訓練優化器整併成「一套規則」——預設正式課程（baseline）＋單一教練層（Claude 依 Garmin 週度優化）＋自動細節微調，全部收進一個有明確優先序的決策器；顯示層跟著乾淨（每個數據一個家）。最終幫跑者持續進步。

---

## 1. 背景與問題

現行練跑計畫（trainer）有 **6 個各自為政的優化器**，作用於不同時間範圍、輸入不同、優先序散在各處、顯示又互相重疊：

| 層 | 觸發 | 作用範圍 | 輸入 | 現函式 |
|----|------|---------|------|--------|
| baseline | 建計畫 | 全週期 | 目標/可訓練日 | `buildPlan`/`buildPhases`/`buildWorkoutContent` |
| 教練處方 | 每次渲染 | 本週（最高權威） | 週報手寫 menu | `applyCoachPlanOverride` |
| 滾動校準 | 教練資料到位 | 未來週 | Garmin 負荷/配速 | `autoRecalibratePlan`/`garminLoadDecision` |
| 週評估調整 | 提交週評估 | 下週 | 主觀疲勞/疼痛 | `adjustNextWeek`/`completeWeeklyCheckin` |
| 當日調整 | 資料到位 | 今天 | 天氣/疼痛/昨日強度 | `applyDailySessionAdvisory` |
| 配速校準 | 手動記錄 | 配速數字 | RPE/實跑 | `autoPaceCalibration`/`adaptiveEasyPaceSec` |

**症狀**：同一組狀態數據（完成堂數 4×、autopilot 決策 3×、階段/週期 3×、目標 km 3×）在四個 tab 重複出現，版面越來越亂。
**根因**：沒有單一決策規則、沒有單一狀態源；每個功能各自重抓資料、各自算、各自顯示。

## 2. 目標與非目標

**目標**
- 一條明確優先序的課程決策鏈（「一套規則」）。
- 單一狀態源，顯示層每個數據只有一個家。
- 每天課程可回答「為什麼是這課」（rationale）。
- 保留所有既有適應行為（不流失教練智能）。
- 我（Claude）每週依 Garmin 紀錄做課程優化，仍是教練層的主幹。

**非目標（YAGNI）**
- 不改 `day.type` 枚舉（Garmin 完成比對依賴）。
- 不動 Garmin 同步協定（4 檔 handshake，見 D4 否決）。
- 不做前端框架化（維持 vanilla classic script）。
- 不追求全自動生成、取代人（Claude）的週度判斷。

## 3. 核心規則：`resolveCourse(day, ctx)` 權威堆疊

一天最終課程 = 由下往上疊、上層可覆蓋或封頂：

```
① 過去凍結      today 以前的課永不改（歷史紀錄，供賽果/配速校準）
② 安全封頂 🛑   疼痛/傷標記 or 極端高溫 or safetyHold → 強制降到恢復/休息
                只能往下砍、永不加量，凌駕一切
③ 我的週度處方  Claude 依 Garmin 開的當週/近週 menu = 該區間權威課程，取代 baseline
④ 當日微調      今天遇高溫/疲勞/昨日高強度 → 降階，能移則移到本週稍後仍符合間隔的空檔
⑤ 自動遞增校準  尚未開處方的「未來週」→ 依 Garmin 負荷/體能趨勢，在安全範圍內遞增量與配速
⑥ baseline 預設 以上都沒蓋到的日子 → buildPlan 產生的預設正式課程
```

**橫貫規則**
- **配速數字單一來源鏈**：教練明訂區間（`coachExplicitZones`）> Garmin LTHR > %HRmax；輕鬆配速取最近 Z2 實跑中位（`adaptiveEasyPaceSec`）。
- **每天一句 rationale**：resolver 回傳 `rationale` 字串，說明哪一層決定了今天的課；顯示層引用它，不再各卡自編。

**優先序理由**：安全永遠最高且只能減（跑者有左腳傷史）；我的週度處方是主幹（人依 Garmin 判斷）；④⑤ 是我觸點之間的自動維持；⑥ 是我還沒碰到的預設。**使用者已確認此優先序。**

## 4. 元件與介面

| 元件 | 職責 | 介面 | 重構自 |
|------|------|------|--------|
| `buildContext()` | 一次組好全部輸入，下游共用 | `() → ctx{today, garminRuns, coachReview, checkins, weather, profile, safetyHold, activityByDate}` | 散在各處的資料抓取 |
| `resolveCourse(day, ctx)` | 單一決策器，依 §3 順序合成 | `(day, ctx) → {course, paces, rationale, source}` | 新增（核心） |
| `safetyGuard(day, ctx)` | 疼痛/傷/極端高溫/hold 封頂 | `(day, ctx) → veto|null` | applyDailySessionAdvisory 安全部分 + safetyHold |
| `coachPrescription(day, ctx)` | 我的週度 menu 覆蓋 | `(day, ctx) → course|null` | applyCoachPlanOverride |
| `dailyAdjust(day, ctx)` | 今日降階＋週內移課 | `(day, ctx) → change|null` | applyDailySessionAdvisory |
| `progression(day, ctx)` | 未來週遞增/校準/週評估調整 | `(day, ctx) → change|null` | autoRecalibratePlan + garminLoadDecision + adjustNextWeek |
| `baseline(day, ctx)` | 預設正式課程 | `(day, ctx) → course` | buildPlan（產出仍存於 plan，resolver 讀取） |
| `paceResolver(ctx, date)` | 配速單一來源鏈 | `(ctx, date) → paces` | hrZones + adaptiveEasyPaceSec + autoPaceCalibration |
| `planStatus(ctx)` | 單一狀態源：完成度/週量/autopilot/預測 | `(ctx) → status{...}` | 殺掉 6× 重複 |

**adapter 契約**：每個 adapter 是（近）純函式，讀 `ctx`、不自行抓資料、不直接改 DOM；回傳「這一層要對這天做的改動或否決」，由 resolver 依優先序合成。放新檔 `site/trainer-coach-engine.js`（classic script，全域，載於 trainer.js 前）。

## 5. 資料流

```
inputs ─→ buildContext() ─┬─ 每天 resolveCourse(day,ctx) → resolvedPlan[]
                          └─ planStatus(ctx) → 一個狀態物件
resolvedPlan + status ─→ 顯示（每個數據一個家）
```

- **每週（我，Claude）**：讀 Garmin → 寫 `教練目標.json` / 週報 → 成為 `coachPrescription` 輸入。
- **觸點之間（app 自動）**：新 Garmin 資料 / 當日 / 提交 checkin 觸發 `buildContext` → resolver 重算。

## 6. 顯示（IA：每個數據一個家）

| tab | 內容 | 資料來源 |
|-----|------|---------|
| 本週課表 | resolvedPlan 週視圖（day card 帶 rationale）＋**一條**狀態列 | resolveCourse + planStatus |
| 教練建議 | 我的週度處方＋為什麼（教練語氣）＋資料衛生提醒 | coachReview + planStatus.reminders |
| 週評估 | checkin 表單＋結果（餵 progression） | checkins |
| 進度與分析 | 預測＋趨勢＋週期（各一個家） | planStatus.projection + trend + periodization |

狀態數據（完成/週量/autopilot 決策）在 `planStatus` **算一次**、顯示一次（頂部狀態列），他處只引用不重算。已完成的前置整併（週標頭去重、progress 提醒卡去重）併入此 IA。

## 7. 分階段實作（每批 `npm run check` 綠燈 + dev server 實機驗 + 可 revert）

1. **Phase 1**：抽 `buildContext()` + `planStatus()`；所有卡改引用它。**先殺顯示重複，零行為變更**。驗證：各卡數字與現況逐一對照一致。
2. **Phase 2**：建 `resolveCourse()`；把 6 個優化器包成 adapter（行為保留），收斂到單一呼叫點取代現有分散呼叫（init 的 autoRecalibrate/applyDailyAdvisory、渲染的 applyCoachPlanOverride）。驗證：同輸入下 resolvedPlan 與現行輸出逐日對照一致。
3. **Phase 3**：每天 `rationale` ＋四 tab IA 收成 one-home。驗證：版面對照、重複計數歸零。
4. **Phase 4**：安全處合併/精簡 adapter（例如 dailyAdjust 與 progression 的重疊）。驗證：行為對照。

## 8. 風險與回退

- **最大風險**：Phase 2 把 6 個優化器行為包進 resolver 時語意漂移。緩解：adapter 逐一「行為保留」重構，每個 adapter 有對照測試（同輸入 → 同輸出 vs 舊函式）。
- **個人健康資料**：全程不動 `runner/訓練/` live 資料；驗證用本機 seed。
- 每 Phase 一 commit，失敗 `git revert` 該 Phase。
- ui-smoke 斷言隨介面調整同步更新（函式改名處）。

## 9. 未決 / 待審點

- Phase 4 的 adapter 合併程度，Phase 3 完成後依實際重疊再定。
- `planStatus` 的確切欄位集合，Phase 1 實作時依現有各卡需求盤點確定。
