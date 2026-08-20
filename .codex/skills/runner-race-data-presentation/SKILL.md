---
name: runner-race-data-presentation
description: 維護 Runner Plaza 的賽事爬蟲、事實資料、公告與詳情表格呈現；用於新增或修正賽事、來源解析、資料刷新與版面一致性問題。
---

# Runner 賽事資料與呈現

適用範圍只有 `D:\Users\Squall\Documents\Runner` 的公開賽事資料流程。目標是讓跑者看見可追溯、可比較的賽事事實；不要以猜測補齊官方未提供的資訊。

## 先確認資料所有權

- Canonical 資料：`runner/賽事/賽事資料庫.json`。
- 人工覆核：`runner/賽事/人工補充.json`；`runner/賽事/人工補充.xlsx` 是操作覆蓋層。
- 公開輸出：`site/data/races.json`；不要只改這個衍生檔。
- 若已驗證的 JSON 校正必須壓過過期的 Excel 列，在該 JSON 列使用 `force_override: true`；只限有明確官方證據的同一賽事。

先檢查現有覆蓋與來源，再改解析器或人工補充。空白、寄送級距、年份片段、免責文字都不是可猜測的賽事事實。

## 解析與正規化規則

- iRunner 的組別表要先取得欄首，再按相同欄序配對費用、名額與起跑時間；不能把整排數字串成無標籤清單。
- Focusline 的 `maxPeople` 是活動總名額，顯示為「總名額 N 人」；配送價格與人數階梯不可當成費用或名額。只有費用數量能和明確組別／起跑組別一一對應時，才保留費用。
- 主辦／協辦不得擷取規程、免責、隱私或同意文字；來源無可用單位名稱時隱藏欄位。
- 已停辦或資料明顯失真時，清除不可信欄位，保留取消狀態與可追溯來源，不要補造數字。

## 詳情資訊的呈現規則

先看資料是否是可比較的列／欄，不要依畫面長度決定。

- 兩筆以上「組別＋費用」：使用組別／費用表。
- 有兩個以上官方方案、通路、早鳥或身份條件：使用組別 × 方案費率矩陣。
- 兩筆以上「組別＋名額」：使用組別／名額表；總名額與限制說明保留為表下註記。
- 起跑時間維持緊湊的組別／時間雙欄列；全馬、半馬的標準距離不重複顯示，距離差超過 0.25K 才補距離。
- 晶片押金、行政費、運費、接駁與其他附加規則是註記，不混入費率列。
- 單一價格或無法可靠拆成列／欄的敘述，使用文字，不捏造表格結構。

共用實作在 `site/app.js` 的 `renderFees`、`renderQuota` 與 `renderFactDataTable`，樣式在 `site/styles.css`。沿用既有森林綠、暖白與緊湊表格元件；窄螢幕必須保有橫向捲動而非截斷表格。

## 刷新、公告與驗證

對會影響公開資料的修改，完整跑：

```powershell
npm run data:refresh
uv run python -m pytest tests/platforms/test_platform_extractors.py
node scripts/ui-smoke-check.mjs
git diff --check
```

`data:refresh` 會依序套用人工補充、去重、同步、資料品質檢查、版面資料檢查，並由 `scripts/build-announcements.mjs` 重建 `site/data/announcements.json`。只有 `data:presentation:quality` 為 0 問題才可交付。

資料或 UI 有改動時，用終端 Playwright 驗證至少一個真實頁面；不要使用 Codex in-app browser。覆蓋：一般多組費用／名額表、一個多方案矩陣，以及任何剛修正的來源案例。

## 交付界線

回報要區分：已由官方來源確認、已由規則阻擋、以及仍待補資料。不要宣稱未查證的費用、名額、主辦或公告內容正確；也不要把資料品質通過說成未來主辦不會改資訊。
