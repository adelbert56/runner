# 賽程收款明細表 — 設計文件

> 日期：2026-06-18
> 性質：本機/Obsidian 專用，不上網站、不進 CI。沿用專案既有「JSON 來源 → build 腳本 → 產出」模式。

## 目的

一人代收朋友的賽事報名費，需要一張表追蹤每場賽事誰付了多少、付了沒、有沒有幫他報名。報名費與郵資由操作者自行分擔結算後，每人填一個總金額（`amount`），保留彈性。資料含真名與金流，僅在本機 Obsidian 檢視，不公開於 GitHub Pages。

## 架構

單向資料流，三種產出：

```
runner/賽事/收款明細.json   ← 手動編輯（資料來源，gitignore，只留本機）
        ↓  node scripts/build-payment-sheet.mjs（npm run payment:build）
runner/賽事/收款明細.md      ← Obsidian 檢視
runner/賽事/收款明細.xlsx    ← Excel（exceljs，已付綠/未付紅、小計+總計列）
runner/賽事/收款明細.svg     ← 圖像（瀏覽器開可另存 PNG）
```

`收款明細.範例.json` 進 git 當範本；真實 `.json` 與三種產出都 gitignore（含真名金流，只在本機/Obsidian）。

## 1. 資料來源 `runner/賽事/收款明細.json`

手動編輯。結構依賽事分組：

```json
{
  "races": [
    {
      "race_id": "291c78c9-41ad-41e5-8a37-41ec356477c8",
      "race_name": "2026幸福龍井路跑",
      "race_date": "2026-05-09",
      "payments": [
        {
          "name": "小明",
          "amount": 860,
          "paid": true,
          "registered": true,
          "paid_date": "2026-03-01",
          "note": "M號"
        }
      ]
    }
  ]
}
```

欄位說明：

| 欄位 | 層級 | 必填 | 說明 |
|------|------|:---:|------|
| `race_id` | race | 選填 | 對應 `賽事資料庫.json`，用來驗證名稱/日期 |
| `race_name` | race | 是 | 賽事名稱 |
| `race_date` | race | 選填 | 賽事日期 |
| `name` | payment | 是 | 付款人姓名 |
| `amount` | payment | 是 | 報名金額（=報名費+郵資，操作者自行結算後填） |
| `paid` | payment | 是 | 是否已收到錢 |
| `registered` | payment | 是 | 是否已幫他報名 |
| `paid_date` | payment | 選填 | 付款日期 |
| `note` | payment | 選填 | 備註（組別、衣服尺寸等） |

## 2. 建置腳本 `scripts/build-payment-sheet.mjs`

對齊 `build-announcements.mjs` 風格：ESM、`node:fs/promises`、`resolve(import.meta.dirname, "..")`、`lib/time.mjs` 取台北時間。

邏輯：

1. 讀 `收款明細.json`（讀檔失敗 → 印錯誤並 fallback 空 `races`，不 crash，比照專案 `66054e5` try/catch 規範）。
2. 若有 `race_id`，去 `賽事資料庫.json` 對名稱/日期；對不上只印警告，不擋產出。
3. 每場彙總：
   - **報名金額合計** = 全員 `amount` 加總
   - **已收** = `paid === true` 者的 `amount` 加總
   - **未收** = `paid !== true` 者的 `amount` 加總
   - **已幫報名** = `registered === true` 人數
4. 全域總計（所有賽事加總）：
   - **總計已收 / 總金額** = 跨所有場次的已收加總 / amount 加總，放檔案最上方，方便一眼看收齊多少。
5. 寫出 `收款明細.md`。

執行：`node scripts/build-payment-sheet.mjs`，並在 `package.json` 加 `"payment": "node scripts/build-payment-sheet.mjs"`。

## 3. 產出 `runner/賽事/收款明細.md`

每場一段：標題 + 摘要行 + 表格。

```markdown
<!-- 此檔由 scripts/build-payment-sheet.mjs 自動產生，請勿手改；改 收款明細.json -->
# 賽程收款明細表
> 產生時間：2026-06-18
> **總計已收 860 / 總金額 1720**

## 2026幸福龍井路跑 (2026-05-09)
> 報名金額合計 1720 / 已收 860 / 未收 860 / 已幫報名 1人

| 人名 | 報名金額 | 已付 | 已報名 | 付款日 | 備註 |
|------|----:|:---:|:-----:|--------|------|
| 小明 | 860 | ✅ | ✅ | 03-01 | M號 |
| 阿華 | 860 | ❌ | ⬜ |  |  |
```

## 錯誤處理

- 來源檔不存在或 JSON 壞 → 印錯誤、產出空表（含說明），exit 0。
- `race_id` 對不上 → 警告，照樣產出。

## 測試

- 手動：放一筆範例資料跑腳本，檢查 Markdown 與彙總數字正確。
- 邊界：空 `payments`、缺 `amount`（當 0 並警告）、缺 `paid_date`/`note`（留空）。

## 匯出（方便收錢）

- **Excel** `.xlsx`：exceljs 產出，表頭深藍、已付綠底/未付紅底、每場小計列、最後全部總計列（黃底）。可直接傳/印給朋友對帳。
- **圖像** `.svg`：完整明細表，標題列深藍、隔列淺底、已付綠勾未付紅叉。瀏覽器開即可截圖或另存 PNG。

## 不做（YAGNI）

網站顯示、CI 排程、Google 表單輸入、前端密碼、報名費/郵資拆帳、自動產 PNG（用 SVG 替代，免 puppeteer）。皆因僅本機使用、操作者自行結算而排除。
