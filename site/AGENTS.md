# Runner 網頁開發

沿用上層 `AGENTS.md` 的練跑硬規則和 Monstrare 關卡。以下指令從 Runner 根目錄執行。

| 變更 | 先看 | 優先驗證 |
| --- | --- | --- |
| 首頁與賽事介面 | `site/index.html`、`site/app.js` | `npm.cmd run ui:check` |
| 教練頁面 | `site/trainer.html`、`site/trainer-render.js`，互動沿 `site/trainer-actions.js` 查找 | `npm.cmd run ui:check` |
| 響應式與版型 | `site/styles.css`、`site/modern.css`；教練頁也看 `site/trainer.css`，依 HTML 的載入順序查覆寫 | `npm.cmd run ui:layout` |
| 課表、教練邏輯或同步 | 從對應的 `site/trainer-*.js` 追資料來源和寫入點 | `npm.cmd run trainer:logic`，需要時加 UI 驗收 |

版型檢查可用 PowerShell 設定 `$env:UI_LAYOUT_VIEWPORTS='mobile,desktop'` 後執行 `npm.cmd run ui:layout`。只改單一尺寸時選對應 viewport。需要完整響應式回歸時，清除此環境變數再執行。

本機預覽用 `npm.cmd run dev`。跨頁或跨模組變更依影響範圍加跑 `npm.cmd test`。靜態 smoke、瀏覽器版型檢查與 Garmin 實際結果各自回報。
