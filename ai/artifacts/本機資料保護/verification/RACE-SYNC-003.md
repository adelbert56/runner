# RACE-SYNC-003 驗證

- `npm run data:sync:check`：隔離測試涵蓋缺檔、損壞 JSON、空陣列、非陣列及有效輸入；異常時保留既有網站輸出並回傳非零。
- `node --check scripts/sync-race-data.mjs`：通過。
- 未對實際 75 筆正本或 71 筆網站副本執行同步，也未確認個別賽事官方資訊或正式網站狀態。此修正無法解決現有資料差異或任何非空但不完整的上游資料。
