# PLAN-TRUTH-002 驗證與審查

使用者已核准修復前述根因並稽核現行計畫。原 root-cause-report 的診斷快照保留作歷程；root-cause-check 已改為執行新的自包含生命週期驗收，無須讀個人 W15 明文。

## 實作與邊界

- trainer.js：未知距離不猜最大組別；既有與新賽事採同距離來源；已確認恢復處方不被通用恢復覆蓋；未知不生成假主課；凍結資料僅校正可由明確資料證明的兩類錯誤並記錄 courseDataCorrection。
- trainer-coach-engine.js：共同 dated recovery 判斷、摘要以解析後課程統計、安全檢核涵蓋教練變更後課型。
- trainer-plan.js：coach 對已確認恢復處方的權限與 resolver 一致；已完成／過去／其他賽事安排仍受原鎖定規則限制。
- trainer-render.js：materialization 經 resolver、匯出先解析再篩選、未知週量不偽裝完整目標。
- server.mjs：設定快照輸出正確 weekday 索引及長跑日；既有配對／權限與路由未更動。
- package.json：trainer:logic 納入生命週期回歸，避免只跑舊單元測試。
- trainer.html 與 smoke：對應資源版本更新；沿用既有畫面與元件。

## 驗證

- `npm run trainer:logic`：既有138項通過，另有生命週期驗收。
- `node scripts/trainer-lifecycle-check.mjs`：涵蓋延遲／先到資料、重複同步、重載、歷史所選週堂數與完成統計、Garmin四堂／26K、未知組別、來源欄位殘留、安全覆寫、正式 materialization、實際 saveData／凍結還原、舊分頁寫入、保留實跑，以及設定快照索引。
- saveData 測試執行實際保存、快照合併、還原、校正及完成紀錄保護函式；一般欄位schema正規化、教練記憶合併、網路與DOM重繪採替身。沒有冒稱為整個瀏覽器端對端測試。
- 明確 safetyOverride 使總量21K時仍保留21K，不以26K強制覆蓋。
- `node scripts/ui-smoke-check.mjs`：197項通過。
- 變更JS/MJS語法及 `git diff --check` 通過。
- 既有加密流程重建個人教練資料；僅密文可供網站使用，明文及金鑰仍留本機。

## 審查

- 追查到保存層才確認凍結快照也是寫入權威；本次不再只用 saveData 空替身證明已修復。
- 既有完成狀態、實跑、其他凍結日與明確安全保護有回歸；不恢復整個歷史週到通用菜單。
- 未變更金流、認證、配對權限或資料庫；未提交／推送／部署；保留任務開始時既有工作區變更。
- 殘留：主課里程與全程實跑的進度語意、長跑放行與恢復判讀等訓練設計項目，見本機 `runner/訓練/驗證/2026-10-18-計畫根因與優化.md`。這些不以程式資料修復代替教練決策。
- 結論：允許本機交付上述已驗證修復，不代表全部訓練內容或正式網站已驗收。

## 本機交付核對

- 已確認原4173程序為 Runner node服務，並確認提供目前工作區的trainer資源後重啟；新服務PID31736。
- HTTP取得 `/site/trainer.html` 與四份trainer腳本，逐份與本機檔案比對一致；資源版本20261018-plan-truth1。
- 加密資料回讀確認10/11為10km、10/18為11km且已確認排入；未輸出明文或金鑰。
- 最後一輪結果：logic退出碼0、138項OK；生命週期11條PASS輸出（含結束摘要）；smoke退出碼0、197項OK。
- 未讀取使用者瀏覽器個人localStorage、未做真實頁面渲染與手錶同步，正式網站尚未發布。
