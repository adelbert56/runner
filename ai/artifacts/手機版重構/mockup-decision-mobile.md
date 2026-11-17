# Mockup 決策：Runner 全站手機版

## Metadata
- 決策負責人：使用者；狀態：已選定。
- 比較稿：`mockups/mobile-variants.html`；資料均為示意，不是真實賽事或課表。

## 變體
| 變體 | 說明 | 優點 | 風險 |
|---|---|---|---|
| A | 任務優先：精簡頁首、今天與下一步置頂、賽事直列 | 第一眼容易找到行動，延續現行設計 | 資訊密度較低，要往下捲 |
| B | 清單優先：工具列與內容列表優先、訓練採緊湊週曆 | 同一畫面看到較多資訊 | 操作較密，需特別維持觸控尺寸 |

## 設計系統對照
- 重用 `--surface`、`--soft`、`--line`、`--ink`、`--muted`、`--green-dark`、Input、Button、Card 與底部導覽。
- 密碼可見性為 Input 加既有 Button 的組合；正式實作前登記 inventory。
- 參考現有已核准 `ai/artifacts/版面現代化/mockup-decision.md`，並對照 [shadcn Input](https://ui.shadcn.com/docs/components/base/input) 的欄位標籤與輔助說明。

## 選定與人工核准
- 變體 A：使用者於 2026-11-17 選擇任務優先，保留現有頁面功能與資料。
