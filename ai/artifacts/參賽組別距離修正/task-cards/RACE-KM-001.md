# RACE-KM-001：11K 參賽距離與週跑量修正

- 目標／核准：使用者確認 2026-10-18 臺中賽事為 11KM；依既有正式課表修復錯抓全馬的計算。
- 類型／風險：小型既有行為修正，低風險；無版面、權限、API、schema 或部署變更。
- 情境包：`trainer.js` 的賽事整合採公開賽事最大距離；`trainer-coach-engine.js` 的正式賽事處方只更新 km，遺留 raceDistanceKm；週跑量優先讀取後者。
- 真相：本機 `runner/訓練/教練目標.md` W15 為 5＋6＋4＋11＝26 km；`coach-profile.json` 已記錄 11km。於既有 `教練目標.json` raceDirectives 補齊距離，透過既有加密流程供前端採用。
- 範圍：上述兩個 JS、trainer.html 快取版本、既有 trainer 邏輯測試、本機教練距離來源與加密輸出、本文件。
- 非目標：變更公開賽事各組別資料、改寫歷史實跑或完成紀錄、調整整週處方、提交與部署。
- 驗收：確認距離優先於公開最大組別；舊賽事距離可校正且重跑不變；當日同步不覆蓋為全馬；正式處方同步更新週跑量欄位；5＋6＋4＋11＝26；完成狀態與實跑保留。
- 驗證：`node scripts/trainer-logic-check.mjs`、`node scripts/ui-smoke-check.mjs`、JS 語法檢查、加密輸出解密後只驗證指定距離。
- 情境預算：僅讀賽事距離、resolver、既有測試與發佈入口；三份情境地圖均仍為範本，不擴大專案探索。TASK_ROUTING.md、VERIFY.md 不存在，採 Ready/Done 與相稱驗證。
- 限制：未確認組別的其他賽事沿用既有 fallback；未存取使用者瀏覽器個人資料，正式網站尚未部署。

## 完成證據（2026-10-18）

- `node scripts/trainer-logic-check.mjs`：129 項通過，涵蓋 11K 優先、歷史校正、同日重套、保留實跑／完成狀態、重複執行與 26K 加總。
- `node scripts/ui-smoke-check.mjs`：197 項通過；距離來源與資源快取版本的舊字串檢查已配合實作更新。
- `node --check site/trainer.js`、`node --check site/trainer-coach-engine.js`、目標檔 `git diff --check` 通過。
- `node scripts/build-training-review.mjs` 已重建本機加密資料；以本機金鑰解密回讀，確認 2026-10-18 directive 為 11km，未輸出金鑰或完整明文。
- 自審：初次整合、既有賽事刷新、賽前減壓、賽後恢復均採相同參賽距離來源；正式賽事 resolver 同步更新 raceDistanceKm，避免週總量殘留舊值。
- 未做：瀏覽器個人儲存內容與畫面驗證（專案禁止瀏覽器控制）、正式部署。未提交，保留工作區原有變更。

## 20K 差異補修（使用者截圖追蹤）

- 前次 26K 驗證只有距離加總，未覆蓋完整 resolver/materialization，不能據此宣稱每日卡片已恢復。
- 已重現：通用 post-race 底稿週一 rest 0K、週二 easy 5K，加週四 4K、週日 11K，共 20K／三堂；既有 coachPrescription 對所有 post-race 直接退出，使正式 dated 5K／6K 無法套入。
- 修正：僅允許日期完全相符、postRaceOf 為先前賽日、分類為 easy 的正式處方覆蓋通用賽後底稿。其餘賽事保護、undated 菜單、硬課、明確 restDates 與 resolver 的 safetyGuard 保持優先。
- 實際執行正式 resolver 與 materializeCoachReviewWeek：每日 5／6／4／11K、總量 26K、四堂跑課，儲存後重載一致；實跑與完成狀態保留。
- 完成 138 項邏輯測試、197 項 smoke 檢查，退出碼均為 0；引擎快取版本升至 race-distance2，語法與目標檔 diff 檢查通過。
- 限制：20K 狀態為依截圖與現有規則重建的重現案例，未讀取使用者瀏覽器儲存內容；網站實際畫面與正式部署仍未驗證。
