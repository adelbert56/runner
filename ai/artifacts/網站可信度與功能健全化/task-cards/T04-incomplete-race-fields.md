# AI-Ready 任務卡

## Metadata
- 任務：T04 不完整費用與名額語意
- 上層規格：`../feature-spec.md`（US5）
- 分軌：前後端串接
- 前置任務（dependsOn）：T01、T03
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
無法可靠對應組別的費用或名額顯示「待確認」，同時保留可靠欄位與來源連結。

## 情境包（Context Pack）
- 相關檔案：賽事正規化／驗證 scripts、`site/app.js`、公開 races JSON schema。
- 驗證規則：已知可靠值原樣保留；解析殘片不得冒充完整事實；未知安全降級。

## 驗收與驗證
- fixtures 覆蓋完整、部分、未知與惡意來源字串；UI 顯示與資料驗證一致。
- 資料測試、UI smoke、XSS 字串檢查、截圖。
