# AI-Ready 任務卡

## Metadata
- 任務：T03 行動版賽事卡 A
- 上層規格：`../feature-spec.md`（US2）
- 分軌：前端
- 前置任務（dependsOn）：T02
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
依已核准 A 版，首層保留日期、名稱、距離、報名狀態與主要操作，次要事實可及地展開。

## 情境包（Context Pack）
- 相關檔案：`site/app.js`、`site/styles.css`、`scripts/ui-layout-check.mjs`。
- 依據：`../screen-spec-賽事列表.md`、`../mockup-decision-賽事列表.md`。
- 重用既有 token／Card／Button／事實列；不得隱藏完整資料或新增框架。

## 驗收與驗證
- 390px 卡片高度門檻通過；鍵盤可展開；桌機資訊完整。
- UI smoke、layout、桌機與 390px 截圖、鍵盤操作檢查。
