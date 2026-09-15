# AI-Ready 任務卡

## Metadata
- 任務：T02 公開資料新鮮度與錯誤狀態
- 上層規格：`../feature-spec.md`（US3）
- 分軌：前端
- 前置任務（dependsOn）：T01
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
賽事頁顯示可信更新時間及正常、待同步、缺時間、載入失敗狀態。

## 情境包（Context Pack）
- 相關檔案：`site/app.js`、`site/index.html`、`site/styles.css`、公開 JSON metadata。
- 重用：既有 token、Card、pill、重試路徑；不得插入不受信任 HTML。
- 視窗／狀態：桌機與 390px；預設、載入、空、錯誤、待同步、缺時間。

## 驗收與驗證
- 不虛構日期；失敗不沿用已更新狀態；狀態可由輔助科技讀取。
- UI smoke、layout、本機 HTTP、桌機與 390px 截圖。
