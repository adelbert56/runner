# 設計系統（Design System）

由 Epic 0「專案設置」的「UI 設計系統」User Story 分五階段（框架 → 風格 → design token → 元件庫 → 版面）逐步填寫。**這份文件是後續所有功能 Epic 做 UI 時的單一事實來源**：任何前端任務開工前都要先讀它，能用既有 token／元件就必須用；缺的元件要照既有風格補做並登記回這裡（見 `ai/skills/project-kickoff.md` 步驟 6 與 `ai/skills/ui-mockup-gate.md`）。

狀態：已建立基線；以現行公開靜態網站為準，2026-08-05 由 Squall 核准「完整事實卡」方向。

## S1 底層框架

- UI 框架：原生 HTML + ES module JavaScript 靜態網站；訓練工具另有 Vite/React。
- 元件庫策略：自建、以語意 class 與 CSS custom properties 共用，不引入第三方 UI library。
- 樣式方案：`site/styles.css` 的 CSS custom properties 與共用元件 class。
- 選定理由：公開 Pages 是資料驅動的輕量網站，既有互動與 localStorage 已依此結構運作。
- 人工核准：Squall／2026-08-05（完整事實卡 A）。

## S2 風格方向

- 選定的 style tile：Runner Plaza／完整事實卡 A。
- 色彩情緒：暖白底、森林綠為主要行動與可信度、黃色只表達提醒。
- 字體個性：`Noto Sans TC`、`Microsoft JhengHei`、system-ui；繁中正文優先可讀性。
- 圓角／陰影傾向：8–10px 圓角，卡片使用輕量向下陰影；資料列以間距和細分隔線，不重複堆疊表面。
- 密度：舒適但資訊完整；列表卡不折疊已取得的決策資料。
- 亮／暗模式：亮色。
- 參考產品：現有 Runner Plaza 卡片與控制項，不另換視覺語言。
- 人工核准：Squall／2026-08-05。

## S3 Design Token 清單

### Primitive Token

| 類別 | Token | 值 | 備註 |
|---|---|---|---|
| 色彩 | `--ink` / `--muted` / `--soft` / `--surface` / `--line` | `#1f2a24` / `#65736b` / `#f6f4ee` / `#fff` / `#e2ded4` | 文字、背景、分隔 |
| 色彩 | `--green` / `--green-dark` / `--yellow` | `#24724f` / `#155338` / `#f5c84c` | 行動、可信度、提醒 |
| 字級 | 網站既有 scale | 12 / 13 / 14 / 16 / 18 / 24 / 32px 等 | 不新增孤立字級 |
| 字重／行高 | 正文／強調／標題 | 400／800–950；1.55、1.34、1.2–1.35 | 中文標題與正文 |
| 間距 | 網站既有 scale | 4 / 8 / 12 / 16 / 18 / 22 / 24 / 32px | 既有介面相容；新資料列只用 8/12 |
| 圓角 | `--radius` / `--radius-sm` | 10px / 8px | Card、按鈕、標籤 |
| 陰影 | `--shadow-card` / `--shadow-soft` | 現行 CSS 定義 | 僅卡片或浮層使用 |
| z-index | header / dropdown | 80 / 20–30 | 固定導覽與行事曆選單 |
| 動效 | hover transition | 160ms ease | hover/focus 回饋 |

### Semantic Token

| Token | 對應 primitive | 用途 |
|---|---|---|
| `color.primary` | `--green-dark` | 主要行動與重要標籤 |
| `color.surface` | `--surface` | 卡片與控制項底色 |
| `color.warning` | `--yellow` 與既有警示文字 | 截止與資料待查證 |
| `color.text-muted` | `--muted` | 次要資訊 |
| `space.page` | `--content-max` | 頁面最大內容寬度 |

### 實際 token 檔位置

- 專案內真實 token 檔路徑：`site/styles.css` 的 `:root`。
- 人工核准：Squall／2026-08-05（在既有 token 上延伸，不新增色彩）。

## S4 元件庫 Inventory

每做一個核心元件就登記一列。後續 Epic 缺元件、照風格補做後也要回來補登。

| 元件 | 狀態 | 涵蓋狀態 | 用到的 token | 檔案位置 | 截圖 | 來源階段 |
|---|---|---|---|---|---|---|
| Button | 已存在 | 預設/hover/focus/停用 | primary、secondary、favorite、calendar | `site/styles.css` | 實際頁面 | 既有 |
| Input | 已存在 | 預設/focus/停用 | surface、line、green | `site/styles.css` | 實際頁面 | 既有 |
| Select | 已存在 | 預設/focus/停用 | surface、line、green | `site/styles.css` | 實際頁面 | 既有 |
| Card | 已存在 | 預設/hover/過期 | surface、line、radius、shadow-card | `site/styles.css` | 實際頁面 | 既有 |
| 賽事事實列 | 已建立 | 完整／缺欄位隱藏／手機單欄 | muted、green-dark、line | `site/app.js`、`site/styles.css` | 本次驗證 | 賽事與內容資訊密度優化 |
| 內容決策摘要 | 已建立 | 跑鞋／新聞 | green-dark、muted、line | `site/app.js`、`site/styles.css` | 本次驗證 | 賽事與內容資訊密度優化 |
| Nav | 已存在 | 預設/hover/focus/窄螢幕橫向捲動 | muted、green-dark、surface | `site/styles.css` | 實際頁面 | 既有 |

（「來源階段」記錄這個元件是 S4 初建，還是後續某個功能 Epic 補做並回登的。）

## S5 各介面版面

| 介面／使用者端 | 選定版型 | Mockup 決策紀錄 | 人工核准 |
|---|---|---|---|
| 公開賽事與內容列表 | 完整事實卡 A | `ai/artifacts/賽事與內容資訊密度優化/mockup-decision-賽事與內容頁.md` | Squall／2026-08-05 |
