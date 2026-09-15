# 驗證報告

## 摘要

- 任務：重整我的賽事待辦為不重複的時間分組清單
- 結果：通過
- 驗證者：Codex

## 近期已報名卡片狀態

- 已報名且距賽 0–6 天：原賽事卡套用黃色底、橘色外框／左側狀態條；當天提高底色強度。
- 距賽 7 天以上、未報名或已過期：不套用近期已報名樣式。
- 可辨識文字仍保留「已報名」與倒數天數，顏色不是唯一提示。
- 驗證：`node --check site/app.js`、`node scripts/ui-smoke-check.mjs`、`git diff --check` 通過；Playwright 以 2026 永慶盃（倒數 5 天）完成實際渲染。
- 截圖：`artifacts/registered-race-under-week-highlight.png`。

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `node --check site/app.js` | 通過 | JavaScript 語法正確 |
| `node --check scripts/ui-smoke-check.mjs` | 通過 | 驗證腳本語法正確 |
| `node scripts/ui-smoke-check.mjs` | 通過 | 含「每場唯一且略過空分組」回歸檢查 |
| `git diff --check` | 通過 | 無空白錯誤 |
| 終端 Playwright | 通過 | 三場只產生三列；分組只有 7 天內與 30 天內 |

## UI 證據

| Viewport | 螢幕截圖 | 備註 |
|---|---|---|
| 桌面版 1280×900 | `output/playwright/my-races-todo-b-desktop.png` | 區塊寬度 1120px，`scrollWidth` 1120px |
| 行動版 390×844 | `output/playwright/my-races-todo-b-mobile-390.png` | 區塊寬度 309px，`scrollWidth` 309px；長賽名與狀態正常換行 |

## 審查發現

| 發現 | 嚴重程度 | 狀態 |
|---|---|---|
| 原優先清單重複列出同一賽事 | 中 | 已移除 |
| 空的今天分組占據版面 | 低 | 已改為不渲染空分組 |
| 行動版狀態繼承 `nowrap` 造成溢位 | 中 | 已改為可換行並重測通過 |

## 殘留風險

- 最多四場與 30 天範圍沿用既有產品規則，未在本次變更中調整。
- 未新增元件；重用 Card、Button、日期塊、狀態 pill 與既有 design token。
