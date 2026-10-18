# 驗證報告

## 摘要

- 任務：COACH-UNLOCK-001
- 結果：通過本機驗證
- 日期：2026-10-04

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| npm run trainer:logic | 通過 | 新增背景刷新對 locked/loading/unavailable/ready 的實際執行回歸 |
| npm run ui:check | 通過 | 現有介面契約 |
| node output/coach-unlock-check.mjs | 通過 | 需本機 4188 預覽與既有本機密語設定；不輸出密語 |
| 手機／桌面 ui-layout-check | 通過 | 使用已安裝 Chrome 的暫存副本，不啟用 Codex 內建瀏覽器 |
| node --check site/trainer.js、site/trainer-render.js | 通過 | 語法 |
| git diff --check | 通過 | 無空白錯誤 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 1280 × 900 | output/playwright/laptop-coach-unlock-fixed.png | 實際本機密文解鎖後，無水平溢出 |
| 390 × 900 | output/playwright/mobile-coach-unlock-fixed.png | 同上，沿用既有版面 |

- 修復前：LOCKED REFRESH { before: true, after: false }。
- 修復後：LOCKED REFRESH { before: true, after: true }。
- 正確密語成功解鎖；故意錯誤密語收到拒絕提示。
- 注入渲染例外後顯示「週報已解密，但頁面顯示失敗」，記住的密語仍存在；重試成功且無須重輸密語。
- 詳細本機日誌：output/coach-unlock-verified2.log、output/coach-repair-logic.log、output/coach-repair-smoke.log、output/coach-repair-layout-final.log。

## 審查發現

- 根因是背景刷新覆蓋載入器擁有的未解鎖狀態，並移除表單事件。
- 解密與渲染錯誤分開處理；有效密語只在真正解密失敗時清除。
- 請求序號避免過期非同步結果覆蓋新請求；不改加密演算法或登入邊界。
- 保留既有未提交變更，未提交或發布。

## 殘留風險

- 尚未發布到公開網站，也未操作使用者原有瀏覽器儲存資料；驗證使用隔離瀏覽器與本機實際密文。
- 標準 Playwright 內建瀏覽器未安裝，驗證改用電腦上現有 Chrome。

## 第二次修復：記住密語後反覆自動解鎖

- 使用者截圖停在「解鎖教練建議中」。首次驗證只觀察到短暫成功畫面，未排除後續載入循環。
- 完整路徑：解密 → 套用賽事 → refreshPlanAfterRaceSync → renderPlanView → loadCoachReview → 再次解密。
- 修正：renderPlanView 在 coachReviewData 已解密時沿用現有資料；明確的重試及重新載入入口仍可讀取新週報。
- 受控重現於賽事同步時觸發整頁重繪：修復前 3 秒內週報請求 7 次；修復後 1 次。
- 記住密語後重新整理：週報請求 1 次，等待 5 秒後仍為 ready、無 aria-busy 載入卡，教練建議工作區持續存在。
- 新增 trainer:logic 實際執行完整 renderPlanView 的回歸：已有解密資料連續重繪不呼叫載入器，缺少資料時仍會呼叫。
- 證據：output/coach-auto-before.log、output/coach-auto-stable.log、output/coach-auto-unlock-check.mjs、output/playwright/coach-auto-unlock-stable.png。
- trainer:logic、ui:check 重新通過；trainer-render.js 資源版本更新為 20261004-coach-unlock-repair2。
