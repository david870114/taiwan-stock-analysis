# 台股分析專案

## 專案說明

這是台股 PER 河流圖分析專案，所有 HTML 分析頁放在此資料夾。

GitHub Pages：https://david870114.github.io/taiwan-stock-analysis/
Repo：https://github.com/david870114/taiwan-stock-analysis

---

## 系統架構

- index.html — 總覽頁（所有股票 + 即時股價，每分鐘自動更新）
- {代號}_analysis.html — 個股分析頁
- 即時股價 API：https://taiwan-stock-price.david870114.workers.dev/?id={代號}

---

## 追蹤清單

| 代號 | 名稱 | 類別 | 估值方法 |
|------|------|------|---------|
| 0050 | 元大台灣50 | ETF | 殖利率法 |
| 2330 | 台積電 | AI/半導體 | PER法 |
| 2345 | 智邦 | AI/網通 | PER法 |

---

## 工具選擇（抓取 goodinfo 數據）

依以下順序判斷可用工具：

1. **Chrome MCP**（`mcp__Claude_in_Chrome__get_page_text`）可用 → 優先使用
2. **Puppeteer MCP**（`mcp__puppeteer__puppeteer_navigate` + `mcp__puppeteer__puppeteer_content`）可用 → 次選
3. 兩者都不可用 → 告知使用者無法自動抓取

---

## 觸發關鍵字

以下任何說法都執行對應流程：
- 「更新 {代號}」→ 情境B（每季更新）
- 「新增 {代號}」→ 情境C（新增股票）
- 若代號已在追蹤清單中 → 改執行情境B（更新），不重複新增
- 「分析 {代號}」→ 情境A（新股票完整分析）

---

## 情境A：分析新股票

1. **資料蒐集**
   - web_search：「{代號} EPS 歷史 2021–2025」
   - web_search：「{代號} 本益比區間 歷史 低檔 高檔」
   - web_search：「{代號} 2026 EPS 法人預估」
   - 自動抓取 goodinfo（依上方工具選擇順序）：
     `https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}`
     等待 6 秒後讀取，**只取近三年（36 個月）月度資料**，不需要更早的歷史

2. **計算估值**
   - PER法：便宜/合理/昂貴價 = TTM EPS × 低/均/高PER
   - 殖利率法（ETF）：合理價 = 年配息 ÷ 均殖利率
   - 本益比歷史區間取近 3–5 年，排除異常高點

3. **產出個股分析 HTML**
   - 檔名：`{代號}_analysis.html`
   - 四個 Tab：PER河流圖、三情境買點、EPS趨勢、完整摘要
   - Y軸不加 NT$
   - PER 圖例：`PER 40x（昂貴）`、`PER 30x（偏貴）`、`PER 22x（合理）`、`PER 15x（便宜）`、`PER 10x（底部）`
   - 白色股價線設定 `spanGaps: true`
   - 左上角加「← 返回總覽」連結到 index.html

4. **更新 index.html**
   - 加入新股票列
   - JS stocks 陣列加入：`{ id: '{代號}', fairValue: X, expensiveValue: Y }`

5. **git push**
   ```
   git add .
   git commit -m "新增 {代號} 分析"
   git push
   ```

---

## 情境B：每季更新（「更新 {代號}」）

1. **自動抓取 goodinfo**（依上方工具選擇順序）：
   `https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}`
   等待 6 秒後讀取

2. **解析數據**
   - 月度 EPS 一律用「10x換算欄 ÷ 10」
   - 季末月（M03/M06/M09/M12）可與「近四季EPS」欄交叉驗證
   - 更新 TTM EPS 和 PER 區間

3. **重新計算估值**

4. **更新個股 HTML + index.html**

5. **git push**
   ```
   git add .
   git commit -m "更新 {代號} 分析"
   git push
   ```

---

## 情境C：新增股票（「新增 {代號}」）

1. 將新股票加入追蹤清單表格（更新本文件）
2. 執行情境A

---

## 類別判斷規則

- 00xx → ETF
- 2330、2303、2379 等 → AI/半導體
- 2345、網通類 → AI/網通
- 2881–2892 等 → 金融股
- 其他 → 其他

---

## 注意事項

- **goodinfo 只取近三年資料**：rawData 陣列只收錄距今約 36 個月的月份，不需要更早的歷史
- goodinfo.tw 載入較慢，務必等待 6 秒再讀取
- EPS 一律用「10x換算欄 ÷ 10」，不用「近四季EPS」欄（季中月會不同）
- 股票代號請補零至 4 碼（如 8046 → 8046，不足者補零）
- StockBenefitConsistency.asp 和 StockPER.asp 已 404，不要使用
