# 跑者廣場

跑者廣場是一個以臺灣中部跑者為主的路跑資訊站，整理臺中、彰化、南投、苗栗賽事，並補充跑鞋新品、跑步新聞與練跑菜單工具。專案目前採靜態網站加 GitHub Actions 自動更新資料，適合小型社群或內部團體用低成本方式維護。

公開網站：[https://adelbert56.github.io/runner/](https://adelbert56.github.io/runner/)

## 目前狀態

- 倉庫狀態：Public
- 網站部署：GitHub Pages
- 賽事資料：每週二、四自動爬蟲與品質檢查，也可手動執行
- 跑鞋 / 新聞資料：每週自動收集候選內容並自動上架摘要
- 本機預覽：`npm run dev`
- 主要資料來源：運動筆記、iRunner、Lohas、CTRun、JoinNow、Focusline、bao-ming、EventGo，以及跑鞋 / 跑步內容來源

## 功能

- 中部路跑賽事公告：依縣市、月份、難度、距離、報名狀態篩選。
- 官方報名入口：優先導向官方或主辦平台，避免只停在資料聚合頁。
- 資料品質標記：保存來源平台、官方直連、最後查證時間、缺漏欄位與人工補充。
- 收藏與行事曆：收藏存在使用者裝置瀏覽器；賽事可匯出手機行事曆使用。
- 場地導航與開跑時間：賽事卡片可直接開啟地圖導航；行事曆內容會帶入各距離開跑時間。
- 賽前天氣：賽事進入 7 天內後，由排程寫入當日縣市天氣預報並在網站顯示。
- 歷史賽事：過期超過一個月的賽事收進歷史資料邏輯。
- 跑鞋新品與心得：整理跑鞋新品、評測心得、選鞋知識與文章收藏。
- 跑步新聞：收集中文跑步新聞與訓練文章，可排序與收藏。
- 練跑菜單：依目標距離、完賽時間、配速、目標賽事日期、每週可跑天數與目前能力生成課表。
- 營運儀表板：追蹤賽事完整度、官方直連率、開報後待補、內容候選量與下一步。
- 上線狀態判斷：區分「上線可用完整度」與「原始資料完整度」，遠期尚未開報賽事會持續追蹤但不阻擋網站上線。

## 技術架構

| 類別 | 技術 |
| --- | --- |
| 網站 | Static HTML / CSS / JavaScript |
| 本機伺服器 | Node.js |
| 賽事爬蟲 | Python 3.11、requests、BeautifulSoup |
| 資料處理 | Node.js scripts、Python scripts |
| 資料格式 | JSON、Markdown |
| 知識庫 | Obsidian-style Markdown vault |
| 部署 | GitHub Pages |
| 自動化 | GitHub Actions |

## 專案結構

```text
.
├── site/                         # GitHub Pages 網站
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── assets/
│   └── data/
│       ├── races.json            # 網站使用的賽事資料
│       └── content.json          # 網站使用的跑鞋 / 新聞資料
├── scripts/                      # 爬蟲、資料整理與報告產生
│   ├── main.py                   # 賽事主爬蟲入口
│   ├── enrich_platforms.py       # 官方平台補資料
│   ├── collect-content-candidates.mjs
│   ├── publish-content.mjs
│   ├── validate-race-data.mjs
│   ├── sync-race-data.mjs
│   ├── build-operational-dashboard.mjs
│   ├── platforms/                # iRunner / Lohas / CTRun 等平台解析
│   └── scrapers/                 # 原始賽事來源爬蟲
├── runner/                       # 第二大腦與資料庫
│   ├── 賽事/
│   │   ├── 賽事資料庫.json
│   │   ├── 人工補充.json
│   │   ├── 中部賽事列表.md
│   │   ├── 資料品質報告.md
│   │   ├── 開報後待補資料報告.md
│   │   ├── 報名日期異常報告.md
│   │   └── 平台爬蟲覆蓋報告.md
│   ├── 內容/
│   │   ├── 候選內容.json
│   │   ├── 候選內容報告.md
│   │   └── 自動上架內容報告.md
│   └── 系統配置/
│       ├── 資料更新SOP.md
│       ├── 營運儀表板.md
│       ├── 內容來源與爬蟲規劃.md
│       └── UI商品化驗收標準.md
├── .github/workflows/
│   ├── pages.yml                 # 部署網站
│   ├── ci.yml                    # 品質檢查與 UI layout 驗證
│   ├── data-refresh.yml          # 賽事資料更新
│   ├── weather-refresh.yml       # 賽前天氣更新
│   └── content-candidates.yml    # 跑鞋 / 新聞候選內容更新
├── package.json
├── pyproject.toml
└── README.md
```

## 快速開始

### 1. 安裝需求

- Node.js 22 或相容版本
- Python 3.11+
- uv
- Git

### 2. 下載專案

```bash
git clone https://github.com/adelbert56/runner.git
cd runner
```

### 3. 安裝 Python 依賴

```bash
uv sync
```

### 4. 啟動本機網站

```bash
npm run dev
```

開啟：

```text
http://localhost:4173/site/
```

不要直接用檔案方式開 `site/index.html`，因為瀏覽器安全限制可能造成 `site/data/*.json` 載入失敗。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動本機靜態網站預覽 |
| `npm run check` | 檢查主要 JavaScript 檔案語法、前端資料載入與內容品質基線 |
| `npm run data:apply` | 套用人工補充資料 |
| `npm run data:sync` | 同步賽事資料到網站資料 |
| `npm run data:quality` | 產生資料品質、待補、異常報告 |
| `npm run data:refresh` | 套用人工補充、同步網站資料、產生品質報告 |
| `npm run data:weather` | 更新 7 天內賽事的當日天氣預報 |
| `npm run data:refresh:online` | 加上官方平台補資料的完整線上更新 |
| `npm run content:candidates` | 收集跑鞋 / 新聞候選內容 |
| `npm run content:publish` | 將候選內容整理成網站資料 |
| `npm run content:refresh` | 收集並發布跑鞋 / 新聞內容 |
| `npm run ops:dashboard` | 產生營運儀表板 |

## UI 商品化驗收

這個專案的 UI 目標不是臨時公告欄，而是可公開使用的跑者資訊產品。任何 UI 調整都必須先遵守：

```text
runner/系統配置/UI商品化驗收標準.md
```

核心要求：

- 維持設計系統一致性，不用補丁式 CSS 修單點問題。
- 跑鞋、新聞、入門、練跑、賽事卡片使用一致的卡片、按鈕、標籤、間距與資訊層級。
- 手機版優先，至少檢查 `#races`、`#academy`、`#training`、`#gear`、`#news`。
- UI 修改後用 Playwright 或瀏覽器實際截圖檢查手機與桌面版。
- CSS/JS 有改動時，更新 `site/index.html` 的版本參數，避免 GitHub Pages 快取。

## 賽事資料更新

本機完整更新：

```bash
uv run python scripts/main.py
uv run python scripts/enrich_platforms.py
npm run data:refresh
npm run data:weather
npm run ops:dashboard
npm run check
```

只想看目前資料品質，不重跑爬蟲：

```bash
npm run data:quality
```

官方平台補資料測試，不寫入：

```bash
uv run python scripts/enrich_platforms.py --dry-run
```

### 賽事資料品質檢查重點

- 官方報名連結
- 精確地點
- 主辦單位
- 報名費用
- 名額
- 開報時間
- 報名截止時間
- 最後查證時間
- 是否官方直連
- 資料來源平台

若報名日已開始但仍缺關鍵資料，會進入 `runner/賽事/開報後待補資料報告.md`。這份報告是下一輪爬蟲或人工補資料的優先清單。

## 跑鞋與新聞資料更新

本機更新：

```bash
npm run content:refresh
npm run ops:dashboard
npm run check
```

主要輸出：

- `runner/內容/候選內容.json`
- `runner/內容/候選內容報告.md`
- `runner/內容/自動上架內容報告.md`
- `site/data/content.json`

內容流程會先收集候選文章，再依分類、分數、標題與摘要品質自動整理到網站。摘要優先使用文章頁面的 meta description；若來源摘要過短或太籠統，會改用站內規則產生跑者視角摘要。

## GitHub Actions

### CI

檔案：`.github/workflows/ci.yml`

觸發：

- 推送到 `main`
- Pull request
- 手動執行

用途：

- 執行 JavaScript、Python、資料品質、內容品質與 UI layout 檢查。
- 確認公開站交付前的基本品質門檻。

### Deploy static site

檔案：`.github/workflows/pages.yml`

觸發：

- 推送到 `main`
- 手動執行

用途：

- 將 `site/` 部署到 GitHub Pages。
- 部署完成後網站位於 [https://adelbert56.github.io/runner/](https://adelbert56.github.io/runner/)。

### Refresh race data

檔案：`.github/workflows/data-refresh.yml`

觸發：

- 每週二、四 18:00 Asia/Taipei
- 手動執行

用途：

- 重跑賽事爬蟲。
- 補官方平台資料。
- 套用人工補充。
- 更新品質報告、追蹤計畫、營運儀表板和網站資料。
- 有變更時自動提交 `chore(data): refresh race data`。

### Refresh race weather

檔案：`.github/workflows/weather-refresh.yml`

觸發：

- 每天 07:00 Asia/Taipei
- 手動執行

用途：

- 更新 7 天內賽事的當日天氣預報。
- 跑完後執行前端資料載入檢查。
- 有變更時自動提交 `chore(data): refresh race weather`。

### Collect content candidates

檔案：`.github/workflows/content-candidates.yml`

觸發：

- 每週一 09:00 Asia/Taipei
- 手動執行

用途：

- 收集跑鞋新品、跑步新聞、訓練文章候選資料。
- 自動整理可上架內容到 `site/data/content.json`。
- 更新營運儀表板。
- 有變更時自動提交 `chore(content): refresh running content candidates`。

## 如何確認 GitHub 上自動化正常

1. 進入 GitHub 倉庫：[https://github.com/adelbert56/runner](https://github.com/adelbert56/runner)
2. 點選 `Actions`
3. 查看五個 workflow：
   - `CI`
   - `Deploy static site`
   - `Refresh race data`
   - `Refresh race weather`
   - `Collect content candidates`
4. 綠色勾勾代表該次成功。
5. 若資料或內容排程成功且有資料變更，GitHub Actions bot 會自動新增 commit。

## GitHub Pages 設定

第一次公開部署時，請確認：

1. GitHub repo 進入 `Settings`
2. 左側點 `Pages`
3. `Build and deployment` 的 `Source` 選 `GitHub Actions`
4. 回到 `Actions` 手動執行 `Deploy static site`，或推送一次 `main`

若 GitHub README 頁面顯示的公開網站仍是舊網址，請確認 `README.md` 已推送到 `main`，正確網址應為：

```text
https://adelbert56.github.io/runner/
```

## 資料維護原則

- 人工補充資料優先權最高。
- 官方平台資料優先於聚合平台資料。
- 報名連結優先導向官方或主辦平台。
- 抓不到資料時保留來源與缺漏欄位，不用猜。
- 開報日前後提高追蹤優先度。
- 報名截止後降低追蹤頻率。
- 賽事過期超過一個月收進歷史賽事邏輯。
- 停辦、報名中、已截止、尚未開報等狀態必須清楚標色。

## 收尾驗收清單

專案要交付或暫告一段落時，至少跑完：

```bash
npm run data:refresh
npm run content:refresh
npm run ops:dashboard
npm run check
uv run python -m compileall scripts
```

驗收重點：

- 賽事：`site/data/races.json` 可由 `runner/賽事/賽事資料庫.json` 同步產生，品質報告與開報後待補報告能重建。
- 入門與練跑：前端 `#academy`、`#training` 仍可正常顯示，不依賴外部 API。
- 跑鞋與新聞：`site/data/content.json` 至少保留可用數量，摘要不過長、不重複。
- GitHub Pages：`Deploy static site` 成功後公開網址為 `https://adelbert56.github.io/runner/`。

## 重要文件

| 文件 | 用途 |
| --- | --- |
| [runner/系統配置/資料更新SOP.md](runner/系統配置/資料更新SOP.md) | 資料更新與檢查流程 |
| [runner/系統配置/本地收尾整理.md](runner/系統配置/本地收尾整理.md) | 本機資料夾、救援資料與排程觀察狀態 |
| [runner/系統配置/營運儀表板.md](runner/系統配置/營運儀表板.md) | 目前資料與內容狀態 |
| [runner/賽事/資料品質報告.md](runner/賽事/資料品質報告.md) | 賽事資料完整度 |
| [runner/賽事/開報後待補資料報告.md](runner/賽事/開報後待補資料報告.md) | 開報後仍缺資料的優先補強清單 |
| [runner/賽事/報名日期異常報告.md](runner/賽事/報名日期異常報告.md) | 開報 / 截止日期邏輯異常 |
| [runner/賽事/平台爬蟲覆蓋報告.md](runner/賽事/平台爬蟲覆蓋報告.md) | 官方平台爬蟲命中狀況 |
| [runner/內容/候選內容報告.md](runner/內容/候選內容報告.md) | 跑鞋 / 新聞候選內容 |
| [runner/內容/自動上架內容報告.md](runner/內容/自動上架內容報告.md) | 已自動上架內容 |
| [SKILLS.md](SKILLS.md) | 代理人實作經驗與協作準則 |

## 常見問題

### 為什麼本機直接開 `site/index.html` 會顯示資料載入失敗？

網站需要讀取 `site/data/races.json` 與 `site/data/content.json`。直接用檔案方式開啟時，瀏覽器可能阻擋本機 JSON 讀取。請改用：

```bash
npm run dev
```

### 手機行事曆能不能直接連動？

目前採 `.ics` 行事曆匯出，Android 與 iPhone 都可匯入。這是小型公開靜態站最穩定、最不需要登入的方式。若未來要做到直接寫入 Google Calendar 或 Apple Calendar，需要 OAuth 登入與後端服務。

### 收藏會不會換裝置就不見？

目前收藏綁在裝置瀏覽器的 localStorage。這符合小眾內部系統低維護成本的需求。若要跨裝置同步，需要登入系統或後端資料庫。

### GitHub Actions 沒有產生新 commit 是不是失敗？

不一定。若爬蟲成功但資料沒有變動，auto-commit action 不會新增 commit。請以 Actions run 的狀態為準。

### 資料沒有全部自動補齊是爬蟲壞了嗎？

不一定。很多賽事一開始只公布日期，詳細地點、費用、名額會等開報後才出現。系統會把「已開報但仍缺資料」列入優先報告，方便下一輪爬蟲或人工查證。

## 開發注意事項

- 不要提交 `.obsidian/workspace.json`，這類本機 UI 狀態已放進 `.gitignore`。
- 更新賽事資料前先檢查 `runner/賽事/人工補充.json`，避免覆蓋人工查證內容。
- 若新增平台爬蟲，請同步更新 `runner/系統配置/內容來源與爬蟲規劃.md` 或資料 SOP。
- 任何 UI 調整都要檢查手機版，尤其是賽事卡片、篩選列、練跑菜單表單。
- 公開網站內容以繁體中文為主。

## License

目前尚未指定授權。若要開放外部貢獻，建議後續補上明確 license。
