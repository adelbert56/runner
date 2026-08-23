# Mockup 決策

## Metadata

- 功能：教練建議 tab 加逐週決策索引
- 畫面：教練建議 tab — 逐週索引
- 決策負責人：Squall
- 狀態：**已核准（維持變體 A）**——2026-08-23 由 Squall 確認。

## 變體

| 變體 | 說明 | 優點 | 風險 |
|---|---|---|---|
| A | 下拉選單選週次（沿用 `.checkin-week-switcher select` 樣式），選中後下方顯示該週清單 | 最省版面、手機版天然可用（原生 select）、實作最簡單 | 使用者無法一眼看到「哪幾週有記錄」，需逐一切換才知道；週數多時下拉選單變長 |
| B | 橫向捲動週次 chips（沿用 `.phase-tab`／`.progress-hub-tabs` 語彙），chip 標示筆記數量，點選切換下方清單 | 一眼看到全部週次與各週記錄多寡，互動直覺 | chips 數量多（如 16 週全馬週期）時橫向捲動在桌面版不明顯，需要額外提示可滑動；新元件比變體 A 多 |
| C | 全週次摺疊清單（沿用 `details/summary`，類似既有 `.coach-history`），逐週一列，展開才顯示內容 | 資訊架構最完整、可同時展開多週比較、無需額外「查看」互動即可瀏覽全貌 | 版面最長，週數多時掃視成本高；預設全部收合時使用者可能不知道哪週有記錄需逐一點開（可用徽章緩解） |

## 設計系統對照

- 重用的 token／元件：見 `screen-spec-教練建議逐週索引.md` 的「設計系統對照」章節，三變體皆已對照。
- 新做並登記回 inventory 的元件：待選定後才登記（見 screen-spec 說明）。

## 選定的變體

- 變體：A（暫定）
- 為何選這個：週期常見 12–16 週，下拉選單資訊密度最高、手機版原生 select 體驗最穩，且完全重用既有 `.checkin-week-switcher select` 樣式，實作與維護風險最低。
- 實作前要求的修改：無（已依此變體實作於 `site/trainer-render.js` 的 `renderCoachWeekIndex` / `renderCoachWeekIndexBody` / `setCoachWeekIndexSelection` / `jumpToWeekCoachReview`，CSS 於 `site/trainer.css` 的 `.week-index-*`）。

## 人工核准

- 核准者：Squall
- 日期：2026-08-23
- 備註：smoke 172/172、logic 44/44、layout 全綠；已用瀏覽器手動注入資料驗證「本週有記錄／無記錄週／歷史週跳轉」三種狀態。
