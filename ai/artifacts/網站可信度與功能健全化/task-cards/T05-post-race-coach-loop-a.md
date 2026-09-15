# AI-Ready 任務卡

## Metadata
- 任務：T05 10K 賽後教練閉環 A
- 上層規格：`../feature-spec.md`（US4）
- 分軌：前端
- 前置任務（dependsOn）：無
- 狀態：草稿（待人工核准）
- 風險等級：中
- Agent owner：Codex
- 人工核准者：待補

## 目標
依 A 版呈現 Garmin 證據 → 48 小時恢復 → 教練判讀，證據不足時維持或降載。

## 情境包（Context Pack）
- 相關檔案：`site/trainer-render.js`、`site/trainer-actions.js`、`site/trainer-garmin-calibration.js`、`site/trainer-safety.js`。
- 依據：`../screen-spec-賽後教練閉環.md`、`../mockup-decision-賽後教練閉環.md`。
- 重用 Trainer token、coach decision/flow/evidence、Modal/Form；不得新增第二套課表或重問 Garmin 已有資料。

## 驗收與驗證
- 未滿 48 小時、缺恢復訊號、疼痛或步態異常均禁止升級；完整證據只允許既有 gate 評估。
- Trainer logic、UI smoke、390px 與桌機各狀態截圖；確認不改 W11 與歷史課表。
