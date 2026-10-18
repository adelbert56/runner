# PLAN-RELEASE-003 驗證與審查

## 已完成

- A版：完成堂數作進度；主課處方、全程實跑、原始實際時間分列；時間缺失不從配速推估。進度條增加語意化ARIA。
- 移除recalibration中全程實跑／主課處方的比值，不再因熱身收操差額自動加降量。前後兩週全程負荷仍可同範圍比較。
- 教練週期套用以先前已排定處方量作同範圍比較，維持原計畫10%管理上限；不將其稱為不受傷的生理保證。holdProgression仍不得增量。
- 恢復資料至少三筆同日有效睡眠／HRV／靜息心率紀錄且最近一筆不早於昨天，才具備推進資料完整性。只有BALANCED、缺值、過期或新日期空殼都不算足夠。高RPE、疼痛等已觀察異常優先說明。
- 品質升級需有效RPE與隔天明確恢復確認；沒有回報不再等同無痛。
- 課程放行保留預覽與原因，不臨時編造替代距離；長跑需近期耐力證據與40%計畫原則，超出者須近七日且課前七日內的明確教練例外與恢復確認。
- 同週賽事不得疊加硬課；半馬級賽事一週內再跑需前場賽後恢復與個別教練確認。傷痛保護不能被既有賽事核准繞過。
- pending課程排除Garmin工作／ICS，於skippedDays提供具體原因；陪跑及今日建議也不得當已放行。重算會先移除舊pending覆蓋，避免再次出現sticky狀態。

## 恢復時間契約

目前raceRecoveryChecks只有savedAt日期，無精確完賽／觀察時間，因此採三個日曆日後有效回報作保守48小時窗口；不把同日、翌日、日期差2天的回報冒充精確48小時。未來若有可靠時區／完賽時間，可改以完整時間戳精算，不能自行補午夜。這是資料精度限制下的管理規則，不是對個人的醫療判定。

## 人工教練核准資料

放行依既有正式週報`nextWeek`或`confirmedWeeks`的`progressionApproval`：`reviewedOn`、`recoveryConfirmed:true`；長跑例外另有`longRunKm`與必要時`maxLongRunShare`，連續半馬另有`approvedRaceDates`。不產生預設核准、不替教練自填、不在一般跑者UI暴露工程欄位。核准過早／過期或前場尚未完成觀察均不能放行。

## 檢查與證據

- `npm run trainer:logic`：既有138項、生命週期驗收，以及新放行6組情境；皆需退出碼0。
- `node scripts/ui-smoke-check.mjs`：197項。舊自動加速文案斷言更新為不因單場上修的契約。
- 專案layout驗證器使用已安裝Edge的headless channel，未啟用Codex Browser。Chromium預設執行檔缺失；新增可選`UI_LAYOUT_BROWSER_CHANNEL`，不下載瀏覽器。
- 完整trainer／registration hero在390與1440寬度檢查；既有「總字數>40」斷言改檢查指導文字實際存在且可見，未更動產品來迎合長度。
- `UI_LAYOUT_RELEASE_ONLY=1`另驗證A版實際renderWeekOverviewCard／planStatus及缺時間狀態，截圖：`output/playwright/mobile-trainer-mileage-scope.png`、`desktop-trainer-mileage-scope.png`；已視覺檢視，無卡片橫向溢出。
- 腳本使用隔離測試資料與暫時browser profile，未讀取使用者真正瀏覽器localStorage。實際手錶未寫入；匯出payload與ICS規則已驗證。

## 審查

- 正確性：過去及已完成課程不套未來放行限制；pending可因有效證據解除，原始結構信心可還原；缺資料不假填。
- 安全／隱私：沒有新帳號、網路寫入或秘密輸出；恢復與核准先驗證日期／型別。公開候選不含個人明文或金鑰。
- 架構：沿用resolver與既有安全邊界，所有匯出讀解析結果；沒有新增另一套持久課表。
- 殘留：真實手錶端接受情形與使用者瀏覽器資料未實測；正式發布仍需最後確認。個別訓練尚未取得恢復資料而pending屬預期行為，不是假定已通過。

## 最後交叉核對

- 138項既有邏輯、11條生命週期PASS輸出（含摘要）與6組放行情境，退出碼0；197項smoke退出碼0。
- 完整專案trainer／registration hero檢查在mobile、desktop均退出碼0；A版專屬畫面／缺時間狀態再次退出碼0。
- 相關JS語法及diff檢查通過，沒有更動其他未提交的賽事、內容資料。
- 本機4173提供20261018-plan-release2；正式站HTTP200但沒有此版本，未冒稱已部署。
- 已備妥`output/releases/2026-10-18-plan-release2/manifest.json`、8個網站候選原檔與驗證原檔、candidate.patch及runtime-status.json。候選是目前工作區完整檔案，含同檔內先前待發布的修復；不宣稱它們是相對任務起點的獨立patch。發布確認前不提交或推送。
