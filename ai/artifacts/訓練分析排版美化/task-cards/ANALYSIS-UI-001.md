# ANALYSIS-UI-001

狀態：done（本機）。核准：Squall 2026-10-18 選A。
目標：摘要→趨勢→明細，保留原有分析。低風險、原生HTML/CSS，無後端契約改動。
來源：site/trainer-render.js renderTrainingAnalysis/renderGarminActualCard、site/trainer.css；驗證 scripts/ui-layout-check.mjs。
非目標：配速演算法、教練規則、正式發布、真實Garmin寫入。
驗收：桌機1440／手機390不溢出、摘要先於圖表且圖表先於明細；表頭scope、數值右對齊、鍵盤可聚焦橫捲區；原有月跑量與進階指標保留；內容escape。
