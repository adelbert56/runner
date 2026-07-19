# 練跑計畫（trainer）重構計畫書

> 產出日期：2026-07-19　狀態：**拆檔＋真人化 已完成並驗證**；資料整合待確認。
> 目標：降低複雜度、整合分散資料、統一描述語氣，且**零行為回歸**。

---

## ✅ 執行結果（2026-07-19）

**已完成並驗證：**
- **拆檔**：`trainer.js` 8162 行 → `trainer.js`(core 2455) + `trainer-copy.js`(198) + `trainer-plan.js`(1449) + `trainer-render.js`(2838) + `trainer-actions.js`(1238)。275 個函式搬移，**358 個函式 body 逐字節等同原檔**（自動比對）。所有 const/table/listener/init 留 core。
- **真人化**：33 處面向使用者的「系統會…」機器口吻 → 教練第一人稱「我／幫你」。剩餘「系統」只在程式註解。
- **接線**：trainer.html 載入順序、`package.json` check、`ui-smoke-check.mjs` 串接清單、`?v=20260719-split1` 快取參數全部更新。
- **驗證**：`npm run check` EXIT=0、299 assertion（＝基準）；dev server 實機載入 22 週真實計畫，四 tab 全渲染、跨模組全域函式全解析、教練信/hrZones/預測/完成度全執行、**主控台零錯誤**。

**待你一句話確認才動（動到已發布個人健康資料／人工工作流／同步協定，不宜無人值守）：**
見下方 §4，每項規格已寫好，確認後可直接執行。

---

## 0. 為什麼要做

`site/trainer.js` 已達 **8162 行、約 300 函式**，單檔混雜渲染／計算／Garmin／狀態機／文案。既有「拆檔」只搬走小 helper（data 92、safety 88、garmin 三檔共 134 行），核心邏輯仍全在一檔。加上兩套並行計畫系統與心率區間三重定義，每次改動都要跨數千行、記得同步多處，維護成本持續上升。

## 1. 現狀資料流（重構前）

| 來源 | 大小 | 內容 | 消費者 | 問題 |
|------|------|------|--------|------|
| `runner/訓練/訓練紀錄.json` | 128KB | Garmin 原始實跑（gitignored） | build script | — |
| `runner/訓練/週報.json` | 7KB | goal/zones/periodization/週課表/trend/runs | 加密後前端 | zones 與 hrZones() 重複 |
| `runner/訓練/教練目標.md` | 9.5KB | 跑者檔+區間表+21週週期 | **無程式讀** | 真相源卻機器讀不到，人工再抄進週報.json |
| `site/data/training-review.enc.json` | 151KB | 週報+實跑 加密發布 | 前端解密 | 內嵌全部實跑，肥 |
| `garmin-sync-status.json` ×1 + `garmin-workout-{pairing,sync-request,sync-status}.json` ×3 | 小 | 配對／同步握手狀態 | trainer.js + ps1 | 4 檔只為一次握手 |
| localStorage `appData` | — | 使用者計畫/log/checkin/週期 | 前端 | — |

**心率區間三重定義**：`週報.json.zones`（發布值）＋ `hrZones()` %HRmax 現算（trainer.js:1714）＋ `教練目標.md` 人工表。三處各自可漂移。

**兩套計畫系統**：教練處方（週報.json）↔ 自動產生器（`buildPlan`/`buildPhases`）。靠 `coachPhaseForWeek` 多數決、`effectiveWeekVolumeTarget` 雙目標調和、教練當週覆蓋 day card 等 glue code 對齊。

## 2. 硬約束（重構不可違反）

1. **classic script、全域共享**：trainer 系列是非 module `<script>`，top-level `function` 即全域，`const`/`let` 共享 global lexical env。→ 拆檔＝把函式區塊剪到新檔並排好 load order 即可，**不需 import/export**。
2. **59 個 rendered inline `onclick` + 25 個 `window.` 引用**：被引用的函式名**一律不可改名**，必須維持全域頂層宣告。
3. **top-level 執行順序**：跨檔的 top-level `const`（如 `DEFAULT_MAX_HR`、`appData`、`currentWeek`）在「執行時」被用到才會 TDZ 出錯；函式體內於 call time 使用一律安全（init 在全部載入後才跑）。→ **每批拆檔後掃該檔有無 top-level 立即執行碼引用尚未載入的常數**。
4. **`day.type` 枚舉凍結**：Garmin 完成比對依賴，重構不可增刪。
5. **`npm run check` 為回歸基準**：逐檔 `node --check` + 跑 `scripts/ui-smoke-check.mjs`（~17 trainer 斷言）。ui-smoke 把所有 trainer 檔**串接成一個字串再 grep 函式樣式** → 新增檔案只需加進串接清單（第 17/34 行），函式名不變即通過。
6. **cache busting**：`trainer.html` 每檔 `?v=` 與 `DATA_VERSION` 需隨拆檔更新。

## 3. 目標模組結構（拆檔後）

保持全域相容，依關注點切。載入順序＝依賴順序（被依賴者先載）：

```
trainer-safety.js            (現存，不動)
trainer-garmin-*.js          (現存 3 檔 → 階段 B 可選併為 trainer-garmin.js)
trainer-copy.js        [新]  所有面向使用者的文案模板（純函式，無副作用）
trainer-plan-build.js  [新]  buildPlan/buildPhases/buildWorkoutContent/buildWeekDays/課表產生
trainer-coach.js       [新]  教練信/校準(autoRecalibratePlan)/日調整/fitnessProjection/goalCycle
trainer-render.js      [新]  所有 renderXxx / 卡片 / modal
trainer.js             [瘦]  資料模型(normalizeData/loadData/saveData)+state+init+事件接線
trainer-data.js              (現存，不動)
```

函式歸屬（依現有行號盤點，執行時逐一搬）：

- **copy**：`buildWorkoutContent` 內文案、`weeklyCoachLetterBody`、`renderRaceWeekCard` pacing 文案、`historyComparisonNote`、`runMilestones`、`postRunVerdict`、`garminSyncFailureGuidance`、各 `*Label` 文字 → 抽成模板函式。
- **plan-build**：`buildPhases`(2098)、`calcLongRunKm`、`calcWorkoutKm`、`buildWorkoutPattern`、`buildWorkoutContent`(2332)、`buildSupportBlocks`、`buildDayCard`、`buildWeekDays`、`buildPlan`(2938)、`restDayStrengthSteps`、`raceDayPackageSteps`。
- **coach**：`garminLoadDecision`、`autoRecalibratePlan`(3050)、`fitnessProjection`、`goalCycleProposal`、`applyDailySessionAdvisory`、`dailyAdvisoryTriggers`、`autoPaceCalibration`、`assessProgress`。
- **render**：所有 `render*`、`show*`、`renderDayCard`、`renderPlanView`、`renderWeekOverviewCard`、progress hub、modal 系統。

> 註：這是「按檔案物理搬移」而非「重新設計架構」。兩套計畫系統的**邏輯合併**風險太高，本次**不碰**，只把它們分別歸位到 plan-build / coach，讓 glue 點看得更清楚，供未來評估。

## 4. 資料整合

> **狀態（2026-07-19，全部授權後執行）：D1/D2/D3 已做並驗證；D4 具技術理由否決。**

| # | 項目 | 結果 | 實際改動／理由 |
|---|------|------|------|
| D1 | 發布檔瘦身 | ✅ 做了（省不多） | `build-training-review.mjs` `slimAnalyticsLaps()`：舊 run（近 20 筆之外）清 `laps[]`。驗證：解密後 0 筆舊 run 帶 laps。**但 151KB 幾乎沒降**——167 筆活動裡只 12 筆有 laps，體積主因是 167 筆詳細 run summary 本身。深度瘦身（丟舊 run 欄位）會犧牲熱調整比較（60 天）、趨勢（8 週）、里程碑，得不償失，故止於安全版。 |
| D2 | 心率區間單一真相 | ✅ 做了＋驗證 | `hrZones()` 新增最高優先 `coachExplicitZones()`：有教練明訂區間就直接採用（source='coach'），否則 LTHR，否則 %HRmax。`showHrZones` 對 coach 來源顯示「教練訂定」。驗證：coach 分支 easy150/tempo159-166/int168-178＝教練值；**目前與 %HRmax 推算數字一致，零回歸**，但教練值現為權威。 |
| D3 | 教練真相源可讀化 | ✅ 做了＋驗證 | 新增 `runner/訓練/教練目標.json`（zones+periodization，gitignored）；`build-training-review.mjs` 存在時覆蓋 `review.zones`/`periodization`，缺檔則沿用週報值（向後相容）。驗證：解密後 tempo=159–166、8 phases 來自 json。**維護方式**：日後心率區間／週期改 `教練目標.json`（機器＋人都讀）；`教練目標.md` 留人類長版說明。 |
| D4 | Garmin 狀態合併 | ❌ 否決 | 這 4 檔不是碎片化，是跨行程 handshake：pairing 憑證＋活動拉取狀態＋課程推送**請求佇列**（頁面寫→PS1 消費）＋推送**結果**（PS1 寫→頁面輪詢）。合一檔會讓請求與結果共用可變檔 → 頁面與 PS1 daemon **讀寫競態**；且動 PS1+server+頁面、需真實 Garmin 往返才驗得完整（我跑不了）。負價值＋不可驗，故不動。 |

## 5. 描述真人化

現況文案**已相當口語**（「像在存體能」「別想著硬撐加量」）。真問題是**散落各處、語氣不一致**。做法：

1. 面向使用者的句子全收進 `trainer-copy.js`，以模板函式產出。
2. 統一為「教練對你講話」的第一人稱語氣；建立小詞庫（鼓勵／提醒／降階說明各一套口吻）。
3. 效益：日後調語氣改一檔，不用翻 8000 行；也讓 A/B 語氣試驗可行。

## 6. 執行順序（分批，每批獨立可驗）

> 原則：先低風險純搬移建立信心，再動資料。每批結束 `npm run check` 必須全綠 + dev server 實機建課驗證。

- **批 0**：跑 `npm run check` 存基準輸出；dev server 建一份計畫截圖存底。
- **批 1（copy）**：抽 `trainer-copy.js`。純文字、無狀態，最低風險。驗證：文字輸出與批 0 逐字一致。
- **批 2（plan-build）**：搬課表產生函式。驗證：同 profile 產生的計畫 JSON 與批 0 相同。
- **批 3（render）**：搬渲染。驗證：四個 tab 版面截圖對照批 0。
- **批 4（coach）**：搬教練/校準。驗證：教練信、校準 toast、日調整。
- **批 5（資料整合）**：區間單一真相 + garmin 檔合併 + 教練目標.json。每子項獨立 commit。
- **批 6（收尾）**：更新 `?v=` 快取參數、ui-smoke 串接清單、`DATA_VERSION`、CLAUDE.md 補模組職責表。

## 7. 驗證矩陣

| 批 | node --check | ui-smoke | dev server 實機 | 對照基準 |
|----|:---:|:---:|:---:|------|
| 1 copy | ✓ | ✓ | 讀文字卡 | 逐字 diff |
| 2 build | ✓ | ✓ | 建新計畫 | 計畫 JSON diff |
| 3 render | ✓ | ✓ | 四 tab 截圖 | 版面對照 |
| 4 coach | ✓ | ✓ | 教練信/校準 | 輸出對照 |
| 5 data | ✓ | ✓ | 區間顯示/同步 | 數值一致 |
| 6 | ✓ | ✓ | 全頁冒煙 | — |

## 8. 回退

每批一 commit。任一批驗證失敗 → `git revert` 該批，不往下走。資料檔改動（批 5）動前先備份 `runner/訓練/` 至 scratchpad。

## 9. 不做（本次範圍外）

- 兩套計畫系統的邏輯合併（風險過高，另案評估）。
- `day.type` 枚舉變更。
- 改 Garmin 同步協定本身。
- 前端框架化（維持 vanilla classic script）。

---

**待你確認**：(1) 分批順序 OK？(2) 資料整合是否本輪就做，或先只做拆檔＋文案（批 1–4）、資料整合另開？(3) `教練目標.json` 抽取要不要做（會改人工維護流程）。
