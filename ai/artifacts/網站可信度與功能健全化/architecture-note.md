# 架構筆記

- 正本：`runner/賽事/賽事資料庫.json`；`site/data/races.json` 僅為受控發布副本。
- 公開賽事頁沿用 `site/app.js`、`site/styles.css` 與既有 Card／Button／展開元件，不新增框架。
- Trainer 沿用既有 Garmin activity、race assessment、48 小時 recovery 與 promotion gate；只增加狀態編排，不建立第二套教練引擎。
- 驗證入口統一串接 Node 檢查、Vite build 與 `uv run pytest -q`，任一步失敗即回傳非零。
- 風險：中。資料發布一致性與教練升級邊界採 fail-closed；公開資料不得含 Garmin 原始資料、token 或報名個資。

## 相依順序

`T01 資料一致性閘門` → `T02 資料可信狀態` → `T03 賽事卡 A` → `T04 不完整欄位`；`T05 賽後閉環 A` 可獨立實作；最後由 `T06 單一驗證入口` 收斂驗收。
