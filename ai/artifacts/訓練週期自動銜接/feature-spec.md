# 訓練週期自動銜接

- 狀態：依使用者授權更新每週教練排程並發布網站接收端。首次真實週報與 Garmin 回執待 12/6 正式觸發。
- 本次範圍：以 2026-12-06 半馬與 12-13 受控 21K 為驗收案例，延用既有週報、加密發布與 Garmin 課程流程。

## 正式週報怎麼接續

- 目標賽後以最後一場實際完成的賽事為恢復起點。沒有回報時，先出保守的休息與短輕鬆跑；明確疼痛、步態改變或其他既有紅旗則照常發布保護週。
- 12/13 受控 21K 需要 12/6 賽後恢復訊號支持。12/13 參賽後，下一週從最後一場重新安排恢復；跳過就依 12/6 後的試跑與隔天恢復接回頻率。
- 未定下一場賽事時，逐週維持有氧基礎。恢復穩定後以每週三跑為起點，再建長跑；確認下一場日期與距離後才切入專項。
- 沿用每週教練排程發正式週報、加密部署及 Garmin 工作流。網站以 `nextWeek.weekStart`、含日期的 `menu` 和 `restDates` 接續，現有 Garmin 輸入維持原契約。保護全休週照樣發布週報，Garmin 上課數為零。

## 現況與實作範圍

- 排課：本機 Claude `weekly-running-coach` 讀週期表，產週報和 Garmin request，再依既有路徑發布。已加入賽後分支，在產生菜單前依最後實際完成的賽事與回報決定恢復方式，再交給原流程。全休週的 `menu` 為空、`restDates` 列齊七天，直接發布網站週報並在 Garmin 收據記錄零堂。Garmin 發布器的輸入需要至少一堂課，該分支直接略過呼叫。
- 取數：`.github/workflows/garmin-sync.yml` 取實跑並重新加密週報；`scripts/build-training-review.mjs` 保留有效菜單、清理過期菜單。賽後排課應沿用每週教練入口。
- 網站：`site/trainer-plan.js` 的通用課表到目標賽週。`site/trainer-render.js` 的 `materializeCoachReviewWeek` 原先只套入既有週次。候選改動僅在賽期後接住日期完整、與現有週次相鄰的正式週報；以相同週次重試及保有歷史為驗收。

## 驗收

- 模擬 12/7 全日期週報，含恢復跑及休息日；補出一週，保留 12/6 課程和完成狀態。再測空菜單、重複週報、全休與儲存失敗。
- 以兩個隔離瀏覽器重播從 12/6 週到 12/7 週。驗證歷史課程、當週導覽與重新開頁；再驗證離線裝置晚回來時能取得正式週次。
- 以模擬賽事及恢復回報驗證週報生成、手錶請求格式及重跑不重複。正式週到期後核對 `runner/訓練/週報.json`、網站與 Garmin 回執。

## 本機證據

- 工作區 `output/garmin-history-deploy` 以正式版 `e1d54e0` 為基準。加入 12/7 案例後，原版 `trainer-lifecycle-check.mjs` 因無法接入新週而失敗，候選改動後 `npm.cmd run trainer:logic` 與 `npm.cmd run ui:check` 通過。
- 隔離 Chrome 在 390 px 和 1440 px、固定 12/7 日期下讀取測試密文。兩個環境皆直接顯示恢復週，重新開頁後仍有 12/6 舊週及 12/7 新週，新週共 7 km。
- 在隔離工作區執行 Garmin 發布器的 `workout_for` 和 `--dry-run`，測試 3 km 與 4 km 兩堂，確認各自的時間熱身、主課距離與時間收操皆轉換成功，並以測試替身確認流程沒有登入 Garmin。
- 預演使用隔離的日期、週報、密鑰與輸出路徑。使用現行加密建置流程，三份模擬週報的正常恢復 7 km、資料延遲 6 km、全休 0 km 均可建置並解密；所有七個日期各出現一次，12/13 未出現在跑課菜單。
- 2026-11-18 核對 Claude Desktop 的排程註冊資料，`weekly-running-coach` 啟用、台灣每週日 21:00、工作目錄為 Runner，指令檔與已驗證候選版的 SHA-256 一致。原檔備份為同層 `SKILL.md.pre-continuation.bak`，工作區 `output/weekly-coach-continuation/original.md` 也保存副本。此次只更新此任務指令，首次賽後正式跑仍待 12/6。

## 正式網站發布

- 以含最新加密週報的 `d7f08b1` 為基底，僅提交接入週次及回歸檢查。[Pages 部署](https://github.com/adelbert56/runner/actions/runs/44309289362)成功，發布提交為 `c942e7ad9c587282e6880c5fc5c4cf4b1013d1d4`。正式網址上的兩支 JS 與加密週報都與提交相同；解密核對 W20 三堂、25 km、11/17 實跑 6.5 km 及 234 筆不重複活動。
- `npm.cmd test`、`npm.cmd run check`、`npm.cmd run build`、`git diff --check` 通過。回歸涵蓋連續週次補回、重試防重、零堂與單堂恢復週、忽略空菜單、儲存失敗還原，以及正式休息日優先於報名紀錄。
- `node output/verify-continuation.cjs --live` 驗證正式站。390 px 預演 12/7；1440 px 預演裝置 12/14 才上線且從週報歷史補回 12/7。兩個測試皆重新開頁驗證持久化。截圖存於獨立工作區 `output/playwright/continuation-live-390.png` 與 `continuation-live-1440.png`。
