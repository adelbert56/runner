# AI-Ready 任務卡

## Metadata

- 任務：COACH-UNLOCK-001 修復教練建議解鎖與載入
- 狀態：完成
- 風險等級：低；不改密文、密語演算法或權限
- 人工核准：使用者要求修復，並確認症狀為「解鎖失敗或一直載入」

## 目標與情境包

- 真實來源：`site/trainer.js` 週報載入器、`site/trainer-render.js` 背景刷新。
- 重現：未解鎖時呼叫 `refreshCoachReviewPanels()`，密語表單由存在變成不存在。
- 允許變更：上述兩檔、`site/trainer.html` 資源版本、`scripts/trainer-logic-check.mjs` 回歸檢查及 `scripts/ui-smoke-check.mjs` 資源版本斷言。
- 不得觸碰：既有未提交變更、訓練資料、密文、Garmin、正式網站。
- 既有模式：沿用解鎖表單、通知卡、既有次要按鈕；恢復現有功能，不重設 UI。
- 情境預算：僅讀取教練載入、背景刷新、驗證入口及相關歷史資料隔離提示。

## 驗收標準與驗證契約

- 背景更新保留 loading／locked／unavailable 狀態及表單事件，ready 時仍刷新建議。
- 正確密語可解鎖；錯誤密語被拒絕。
- 渲染錯誤不誤報密語錯誤或清除有效密語，可重試。
- 過期載入回應不能覆蓋新的解鎖請求。
- 執行 trainer:logic、ui:check、針對手機與桌面的頁面驗證、語法與 diff 檢查。
- 完成證據：`../verification/COACH-UNLOCK-001.md`。
