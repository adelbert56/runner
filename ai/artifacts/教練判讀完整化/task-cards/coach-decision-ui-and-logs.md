# AI-Ready 任務卡

## Metadata

- 任務：A 版放行判讀卡、賽後恢復與補給紀錄
- 上層規格：`feature-spec.md`
- 分軌：前端
- 前置任務（dependsOn）：`coach-decision-foundation`
- 狀態：完成
- 風險等級：中
- Agent owner：Codex
- 人工核准者：Squall（A，2026-08-24）

## 目標

在既有「進度與分析」頁放入單一可掃讀的放行判讀卡，並將賽後 48 小時與 16K 以上長跑的紀錄存在本機既有訓練資料中。

## 驗收標準

- 卡片明列恢復、資料品質、坡度、賽後回報四種證據與暫緩理由。
- 賽後回報可記錄疲勞、疼痛、步態；疼痛／步態改變／疲勞 4 以上顯示暫緩。
- 16K 以上長跑可記錄早餐、水分、電解質、碳水與腸胃反應，重整後保留。
- 窄螢幕改為單欄，使用既有 token。

## 驗證契約

- UI 靜態檢查：`npm run check`
- DOM／布局檢查：`node scripts/ui-layout-check.mjs`
- 回歸：`node scripts/trainer-logic-check.mjs`
