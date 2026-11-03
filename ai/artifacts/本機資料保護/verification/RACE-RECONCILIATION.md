# 賽事對帳與驗證紀錄

- 2026-11-03：先將同步前賽事正本、網站副本、公告及人工覆核 JSON 備份至 `%LOCALAPPDATA%/RunnerRaceBackups/sync-20261103-110848-681`，前兩份及公告以 SHA-256 比對。同步預演顯示原本 71 筆均可對應，網站副本同步為正本 75 筆，未部署。
- 以主辦或報名平台來源核對並修正田中馬、臺中舒跑杯、通霄粉紅超跑、CRUFU RUN、幸福龍井、海綿寶寶、員林獅子盃、國際女孩日及日月潭費率／名額／起跑資料；原始來源與尚有衝突之處記於人工覆核資料。停辦的 BOBDOG、KOF 移除未可信對應的費用與名額。
- 資料來源：<https://irunner.biji.co/Tianzhong2026?page=5069>、<https://supaucup.com.tw/info>、<https://lohasnet.tw/Tongxiao2026/>、<https://www.focusline.com.tw/api/act/260919KN>、<https://www.joinnow.com.tw/about.php?cnt_id=135&type=1>、<https://irunner.biji.co/2026SpongeBob-TXG>、<https://lohasnet.tw/YuanLinLionsClub2026/>、<https://irunner.biji.co/internationalgirlsfestival?page=5598>、<https://irunner.biji.co/sunmoonlakemarathon2026>。
- `npm run data:verified:check` 通過既有覆核鏈、Excel 覆蓋及部分表格邏輯；`npm run check` 通過正本／本機網站副本一致性。Focusline 平台測試 14 項通過。未實測真實瀏覽器畫面。
- `npm run data:presentation:quality` 未通過：75 場有 5 場欄位缺少可靠組別或總額語意。原始資料不應猜測或為消除警告而刪除；未具備零問題交付條件。
- `npm run site:status` 顯示本機網站 75 筆與遠端 74 筆不同，公告亦不同；未發布、未驗證正式站。
- 後續讀取 Focusline 官方組別 API（`https://www.focusline.com.tw/api/raceEvent/261205LG`、`https://www.focusline.com.tw/api/raceEvent/261226IA`），依其組別名稱與 `unitPrice` 補充兩場早鳥價格，其他方案明示待確認。嚴格呈現檢查尚有 3 場問題，仍未通過；不能因此宣稱所有賽事已查證。
- 再對照 Focusline 官方頁面內容 API（`https://www.focusline.com.tw/api/pageContent/261107KZ/3566`、`https://www.focusline.com.tw/api/pageContent/270110KW/3545`）：幼安的數字為郵寄費級距，名額僅標示額滿為止；仁愛賽事依官方表格標示個人、接力與在地方案，並註記其他來源差異。FUN 電的官方頁各組均列 4000 人，但未明示是否共用，資料保留此不確定性。`npm run data:presentation:quality` 檢查 75 場、0 項格式問題；這不代表每個欄位已驗證真實性。
- 重建資料品質報告：75 場中 28 場有待追蹤欄位，5 場缺官方報名連結；起跑時間品質問題 0。重建公告時發現 `verified_at` 原本被誤寫成「補齊報名網站與時間」，已改為「查證賽事資訊」；重建後檢查 6 筆更新公告及 `npm run check` 通過。
- 竹山站：2026-11-03 Focusline 官方 API 顯示報名中、11/13 23:59 截止，較早公所公告為 10/31；本機資料採報名平台並保留差異提示。來源：`https://www.focusline.com.tw/api/act/261213HW`、`https://www.daan.taichung.gov.tw/4061900/post`。
- 柏釧公益路跑：原紀錄的日期、費用及報名來源與運動筆記 cid=13170 的晨曦麥香馬拉松一致，卻與柏釧的名稱及彰化地點混合。依 `https://www.taipeimarathon.org.tw/contest.aspx` 及 `https://www.paobaodao.com/tw/race/7th-bc-forged-charity-half-marathon/` 更正為 2027-04-10 彰化、21K／10K／5K／3K，清除錯置的報名及費用資訊；主辦正式公告仍待確認。同步與品質報告重建後，已開報資料缺漏數由 1 降為 0，不代表主辦資訊已完整。
- 上游合併防護：`scripts/processors/dedup.py` 原本把樂活平台首頁等共用網址當作賽事識別；柏釧與晨曦在同一天、同縣市且共用首頁的合成案例可重現誤合併。已排除平台共用首頁作為識別依據，保留正式 cid 的跨日期修正能力；`uv run python -m pytest -q` 36 項通過，`npm run check` 通過。此結果證實合併缺口與修正，不能倒推當時資料污染的唯一觸發事件。
- 補充衝突防護：兩筆資料同時帶有不同運動筆記 cid 時，即使共用具體連結也不自動合併。合成測試涵蓋不同 cid 與相同 cid 跨日期；完整 Python 測試 37 項及 `npm run check` 通過。不同 cid 若實際指向同一賽事，將保留多筆供後續查證。
