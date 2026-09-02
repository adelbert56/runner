# 驗證報告：TRAINING-REPORT-COACH-001

## 摘要

- 任務：C 版單堂主課逐段教練判讀
- 結果：部分通過
- 驗證者：Codex

## 指令

| 指令 | 結果 | 備註 |
|---|---|---|
| `node --check site/trainer-render.js` | 通過 | JavaScript 語法可載入。 |
| `node scripts/trainer-logic-check.mjs` | 通過 | 新增 ACTIVE 主課、時間加權、逐段敘事與缺心率降級案例皆通過。 |
| `node scripts/ui-smoke-check.mjs` | 通過 | 確認逐段判讀、既有單堂報告與主課範圍保護仍存在。 |
| `npm run ui:layout` | 部分通過 | 訓練報告手機 layout 通過；既有賽事卡高度檢查失敗，與本任務無關。 |
| `git diff --check` | 通過 | 本次工作區無空白格式錯誤。 |

## UI 證據

| Viewport | 證據 | 備註 |
|---|---|---|
| 桌面版 | `ui-smoke-check` 與現有報告結構檢查 | 新增的敘事列保留在既有右側教練判讀區。 |
| 行動裝置版 | `ui-layout-check`：`OK mobile/trainer report layout` | 新增敘事列在 620px 以下轉為單欄。 |

## 審查發現

| 發現 | 嚴重程度 | 狀態 |
|---|---|---|
| ACTIVE 標籤原先未被後半訊號納入 | 中 | 已修正；與 Garmin 主課選取順序一致。 |
| 最後一段含多圈時不可取單圈 HR | 中 | 已以時間加權計算並加入回歸測試。 |
| 賽事卡手機高度超出既有門檻 | 低 | 未處理；不在本任務範圍。 |

## 設計系統對照

- 重用 `--c-tint-green`、`--c-primary-hover`、`--c-text-muted`、既有 `session-coach-callout` 與分段表。
- 未新增元件、色彩、API 或資料寫入。

## 殘留風險

- 本次遵循 workspace 禁止使用 in-app Browser 的規則，未取得人工互動截圖；以既有靜態訓練報告 layout 檢查替代。
- 未以每一種真實 Garmin 活動步驟組合完整人工回放；MAIN、ACTIVE、INTERVAL 與缺值行為已由純函式與既有 smoke 檢查覆蓋。
