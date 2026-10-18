# 課型否定清單修正

日期2026-10-19，核准範圍：使用者要求查明並修正2026-10-20恢復有氧被標間歇。低風險既有功能缺陷，不改版面。

真實來源：runner/訓練/週報.json當日plan，明寫平路E跑7km，不做ST、坡跑、節奏或間歇。
根因一：trainer-copy.js coachPlanTrainingType只移除緊接間歇的否定句，漏掉列舉。根因二：trainer-render.js coachWorkoutStructure直接搜尋間歇，連否定提醒也當interval步驟。
修正：消除有限課型清單的否定語意，保留其他真正硬課；步驟kind共用coachPlanTrainingType。保留正式提供的suppliedSteps優先權，不改私有處方。

驗證：npm run trainer:logic、node scripts/ui-smoke-check.mjs皆exit0。新增恢復否定清單、否定節奏清單、真正間歇/節奏/長跑保留，以及舊interval底稿生成warmup/main/cooldown和7000m主課的測試。未寫入真實Garmin；正式站尚未更新，既有Garmin課程須另同步替換。
