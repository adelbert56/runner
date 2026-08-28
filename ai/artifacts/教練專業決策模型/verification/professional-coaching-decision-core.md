# 教練專業決策模型核心驗證

日期：2026-08-28

## 驗收結果

| 驗收項目 | 證據 | 結果 |
|---|---|---|
| 長跑的 130–155 與上限語意 | `longRunHrTarget` 實測 130–155；長跑卡新增可交談、RPE 4–6、走 1 分、縮短與不補量指令。 | 通過 |
| 缺少關鍵證據不可升級 | 邏輯測試覆蓋缺結構 Garmin、RPE、隔天恢復、談話測試，皆回傳 `conditional`；症狀回傳 `blocked`。 | 通過 |
| 一週壓力預算 | 邏輯測試以品質課、漸進長跑與賽事驗證：保留賽事與長跑品質段，品質課降為恢復跑並保留原因。 | 通過 |
| 課表／Garmin 同源 | `buildDayCard` 的 `hrTarget` 同時寫入 `workoutStructure`；既有 13.5 km 長跑 Garmin 結構測試仍通過。 | 通過 |
| UI 載入與靜態契約 | `node scripts/ui-smoke-check.mjs` 全數通過。 | 通過 |

## 執行指令

```text
node scripts/trainer-logic-check.mjs
node scripts/ui-smoke-check.mjs
node scripts/build-training-review.mjs --help
git diff --check
```

## 結果摘要

- `trainer-logic-check.mjs`：全數 `OK`，含本任務新增 10 項護欄測試。
- `ui-smoke-check.mjs`：全數 `OK`。
- 週報建置入口成功產生 `site/data/training-review.enc.json`。
- `git diff --check`：無空白錯誤。

## 已知限制

- 談話測試是由週檢核明確確認，Garmin 不會自行猜測。
- 本次沒有變更遠端 Garmin 行事曆，因此沒有新增 `replaced` 回條；實際發布結構變更時仍須檢查回條，不可將 `reused` 視為更新成功。
- 沒有新增版面或元件；長跑指令沿用既有「執行提醒」區塊呈現。
