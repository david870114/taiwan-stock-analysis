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
| 2303 | 聯電 | AI/半導體 | PER法 |
| 2345 | 智邦 | AI/網通 | PER法 |

---

## 抓取 GoodInfo 數據（已確認可用方法）

### 主要方法：直接呼叫 Node.js Scraper（每次都有效）

```powershell
node C:\Users\USER\goodinfo_scraper.mjs <股票代號> per     # PER 河流圖資料
node C:\Users\USER\goodinfo_scraper.mjs <股票代號> detail  # 股票基本資訊
node C:\Users\USER\goodinfo_scraper.mjs <股票代號> div     # 股利日程（年化現金股利）
```

`div` 模式會回傳 `annualDiv`（年化現金股利元/股），自動判斷年配/季配/半年配。
**注意：GoodInfo 有流量限制，批次抓取需每支間隔 20 秒以上，封鎖約 1–2 小時後自動解除。**

**用 PowerShell 工具執行**，例如：
```
PowerShell: node C:\Users\USER\goodinfo_scraper.mjs 2330 per
```

輸出為 JSON，成功時 `success: true`，內含頁面文字和表格資料。

### 技術細節（2026-06-08 測試確認）

- `waitUntil: 'domcontentloaded'`（不用 networkidle2，否則會 JS 跳轉錯誤）
- 等待 6 秒讓 JS 執行完成
- 隱藏 `navigator.webdriver`，設定真實 User-Agent
- 使用 Chrome 路徑：`C:\Program Files\Google\Chrome\Application\chrome.exe`
- Puppeteer 位置：`C:\Users\USER\AppData\Roaming\npm\node_modules\@modelcontextprotocol\server-puppeteer\node_modules\puppeteer`

### Puppeteer MCP 說明

`settings.json` 已設定 Puppeteer MCP，`/mcp` 顯示 connected，但**工具不會出現在 Claude 的 context**（Windows 上 Claude Code 的已知問題：MCP server 啟動成功但 tools 不載入）。

**請勿等待 MCP 工具，直接用上方 PowerShell 方法**。

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

## annualDiv 維護（每年 6–8 月更新一次）

`index.html` 的 TRACKED 陣列每個股票有 `annualDiv` 欄位（年化現金股利，元/股）。
除息季（約 6–8 月）結束後用 `div` 模式重新抓取並更新：

```powershell
# 等 GoodInfo 未被限流時執行（每支間隔 20 秒）
node C:\Users\USER\goodinfo_scraper.mjs 2330 div   # 回傳 annualDiv
```

- **季配股**（台積電等）：scraper 自動取最近 4 筆加總
- **年配股**（聯電等）：scraper 取最新一筆
- **虧損無配息**（群創、旺宏、華邦電、南亞科）：填 0

目前 ⚠️ 待確認：2308 台達電、2345 智邦、3017 奇鋐、3324 雙鴻、6669 緯穎、2301 光寶科、8210 勤誠、3037 欣興、8046 南電

---

## 注意事項

- **goodinfo 只取近三年資料**：rawData 陣列只收錄距今約 36 個月的月份，不需要更早的歷史
- goodinfo.tw 載入較慢，務必等待 6 秒再讀取
- EPS 一律用「10x換算欄 ÷ 10」，不用「近四季EPS」欄（季中月會不同）
- 股票代號請補零至 4 碼（如 8046 → 8046，不足者補零）
- StockBenefitConsistency.asp 和 StockPER.asp 已 404，不要使用
- **新增股票到 index.html 需同時做兩件事**：
  1. 在對應 section 的 `<tbody>` 加入 `<tr>` 列（有 `id="price-{代號}"` 和 `id="vs-{代號}"`）
  2. 將代號加入 `CHAIN_STOCKS` 陣列（否則供應鏈地圖 mini-card 不會更新即時股價）
