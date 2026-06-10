# 台股分析專案

## 專案說明

這是台股殖利率/PER 河流圖分析專案，所有 HTML 分析頁放在此資料夾。

GitHub Pages：https://david870114.github.io/taiwan-stock-analysis/
Repo：https://github.com/david870114/taiwan-stock-analysis

---

## 系統架構

- index.html — 總覽頁（所有股票 + 即時股價，每分鐘自動更新）
- {代號}_analysis.html — 個股/ETF 分析頁
- 即時股價 API：https://taiwan-stock-price.david870114.workers.dev/?id={代號}
- Scraper：`node "C:\Users\USER\goodinfo_scraper.mjs" {代號} per|div|detail`

---

## ⚡ 先判斷 ETF 或個股，再選對應資料蒐集方式

| 代號格式 | 類型 | 估值方法 |
|---------|------|---------|
| 00xx（0050、0056、00919 等） | ETF | **殖利率法** |
| 4位數字（2330、2345 等） | 個股 | **PER 法** |

### ETF 資料蒐集

1. **配息歷史**：`node "C:\Users\USER\goodinfo_scraper.mjs" {代號} div` → 回傳 `annualDiv`（TTM 年化配息）
2. **月線股價**：Chrome MCP 開啟 goodinfo PER 頁面，ETF 的 EPS 欄全是「-」屬正常，**收盤價欄完整可用**，逐月讀取即可

### 個股資料蒐集

1. **PER 河流圖**：`node "C:\Users\USER\goodinfo_scraper.mjs" {代號} per`，或 Chrome MCP 開啟 goodinfo PER 頁面
2. **EPS 正確讀法**：`河流圖 EPS = 10x 換算欄 ÷ 10`（不用「近四季EPS」欄，季中月會不同）
3. **配息數據**：`node "C:\Users\USER\goodinfo_scraper.mjs" {代號} div`

---

## 追蹤清單

| 代號 | 名稱 | 類別 | 估值方法 | 分析頁 |
|------|------|------|---------|-------|
| 0050 | 元大台灣50 | ETF | 殖利率法 | 0050_analysis.html |
| 0056 | 元大高股息 | ETF | 殖利率法 | 0056_analysis.html |
| 00919 | 群益台灣精選高息 | ETF | 殖利率法 | 00919_analysis.html |
| 2301 | 光寶科 | 電源/EMS | PER法 | 2301_analysis.html |
| 2303 | 聯電 | AI/半導體 | PER法 | 2303_analysis.html |
| 2308 | 台達電 | AI/電源 | PER法 | 2308_analysis.html |
| 2327 | 國巨 | 被動元件 | PER法 | 2327_analysis.html |
| 2330 | 台積電 | AI/半導體 | PER法 | 2330_analysis.html |
| 2337 | 旺宏 | 記憶體 | PER法 | 2337_analysis.html |
| 2344 | 華邦電 | 記憶體 | PER法 | 2344_analysis.html |
| 2345 | 智邦 | AI/網通 | PER法 | 2345_per_analysis_2026.html |
| 2382 | 廣達 | AI/伺服器 | PER法 | 2382_analysis.html |
| 2408 | 南亞科 | 記憶體 | PER法 | 2408_analysis.html |
| 3017 | 奇鋐 | AI/散熱 | PER法 | 3017_analysis.html |
| 3037 | 欣興 | ABF載板 | PER法 | 3037_analysis.html |
| 3231 | 緯創 | AI/伺服器 | PER法 | 3231_analysis.html |
| 3260 | 威強電 | 工業電腦 | PER法 | 3260_analysis.html |
| 3324 | 雙鴻 | AI/散熱 | PER法 | 3324_analysis.html |
| 3481 | 群創 | 面板 | PER法 | 3481_analysis.html |
| 3596 | 智易 | AI/網通 | PER法 | 3596_analysis.html |
| 4790 | 日盛金 | 金融 | PER法 | 4790_analysis.html |
| 6669 | 緯穎 | AI/伺服器 | PER法 | 6669_analysis.html |
| 6770 | 力積電 | 晶圓代工 | PER法 | 6770_analysis.html |
| 8046 | 南電 | ABF載板 | PER法 | 8046_analysis.html |
| 8210 | 勤誠 | AI/機殼 | PER法 | 8210_analysis.html |
| 1303 | 南亞 | 石化 | PER法 | 1303_analysis.html |

---

## 抓取 GoodInfo 數據

### Scraper 指令（每次都有效）

```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" <股票代號> per     # PER 河流圖資料
node "C:\Users\USER\goodinfo_scraper.mjs" <股票代號> detail  # 股票基本資訊
node "C:\Users\USER\goodinfo_scraper.mjs" <股票代號> div     # 股利日程（年化現金股利）
```

`div` 模式自動判斷年配/季配/半年配，回傳 `annualDiv`。
**注意：GoodInfo 有流量限制，批次抓取需每支間隔 20 秒以上。**

### Chrome MCP 備用方式

```
navigate → https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}
等待 6 秒 → get_page_text
```

### 技術細節（2026-06-08 測試確認）

- `waitUntil: 'domcontentloaded'`（不用 networkidle2）
- 等待 6 秒讓 JS 執行完成
- Puppeteer MCP 雖設定但工具不會出現（Windows 已知問題），**改用 PowerShell 執行 scraper**

---

## 執行流程

### 觸發關鍵字

- 「新增 {代號}」→ 新增流程
- 「更新 {代號}」→ 每季更新流程
- 「分析 {代號}」→ 新增流程
- 若代號已在追蹤清單中 → 執行更新，不重複新增

### 新增流程

1. 判斷 ETF 或個股 → 選對應資料蒐集方式（見上方）
2. 抓取數據（全自動，不需使用者截圖）
3. 產出分析 HTML（五個 Tab，見下方規範）
4. 同步更新 index.html（四處）
5. 更新本文件（CLAUDE.md）追蹤清單
6. `git add . && git commit -m "新增 {代號} 分析" && git push`

### 每季更新流程

1. 判斷 ETF 或個股 → 選對應資料蒐集方式
2. 補充最新月份數據，重新計算估值
3. 更新分析 HTML + index.html
4. `git add . && git commit -m "更新 {代號} 分析" && git push`

---

## HTML 規範（五個 Tab，缺一不可）

### 個股（PER 法）— 參考 2345_per_analysis_2026.html

- Tab：📈 PER 河流圖 ／ 🎯 三情境買點 ／ 📊 EPS 趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- EPS 趨勢 Tab 含逐月明細表格（月份、收盤、EPS、PER、各倍數換算值）

### ETF（殖利率法）— 參考 0056_analysis.html / 00919_analysis.html

- Tab：📈 殖利率河流圖 ／ 🎯 三情境買點 ／ 📊 配息趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- 殖利率帶以 TTM annualDiv 計算，標示各殖利率區間對應價格
- 配息趨勢 Tab 含逐季配息明細表格

### 共用規範

- 字型：`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 背景：`#0f1117`，文字：`#e2e8f0`，卡片：`#1e2535`
- 左上角「← 返回總覽」連結
- Chart.js CDN：`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js`
- 白色股價線 `spanGaps: true`，Y 軸不加 NT$
- 基本面 Tab：即時 fetch 股價計算即時殖利率/PER（element id `fund-pe` 或 `fund-yield`）

---

## index.html 更新（每次新增/更新必須改四處）

**1. 對應 section 的 tbody 加新列**
```html
<td class="code code-etf">{代號}</td>  <!-- ETF 用 code-etf -->
<td class="name"><a href="{代號}_analysis.html">{名稱}</a></td>
<td>{便宜價} <span class="per-sub">...</span></td>
<td>{合理價} <span class="per-sub">...</span></td>
<td>{昂貴價} <span class="per-sub">...</span></td>
<td class="price-cell loading td-cur" id="price-{代號}">…</td>
<td id="vs-{代號}" class="loading">—</td>
<td class="td-tp">—</td>
```

**2. STOCKS 陣列**
```javascript
{ id:'{代號}', fairValue:X, expValue:Y },
```

**3. TRACKED 陣列**
```javascript
{ id:'{代號}', name:'{名稱}', tier:'core'/'growth'/'spec', fairValue:X, expValue:Y, fairPER:null/N, tp:null, cheapValue:Z, annualDiv:D },
```

**4. CHAIN_STOCKS 陣列**（個股必加，ETF 視情況）
```javascript
'{代號}'
```

---

## 類別判斷規則

- 00xx → ETF
- 2330、2303、2379 等 → AI/半導體
- 2345、3596 等網通類 → AI/網通
- 2382、3231、6669 等 → AI/伺服器
- 3017、3324 等 → AI/散熱
- 2881–2892 等 → 金融股
- 其他 → 依產業判斷

---

## EPS 河流圖正確讀法（個股專用）

goodinfo 截圖有兩種 EPS 數值：

| 欄位 | 內容 | 能否用於河流圖？ |
|------|------|----------------|
| 「近四季EPS」欄 | 當下最新 TTM，全表同一個值 | ❌ 季中月會不同 |
| 「本益比換算價格 10x」欄 ÷ 10 | 每月不同，河流圖實際用的值 | ✅ 正確 |

季末月（M03/M06/M09/M12）兩欄應相等，可交叉驗證。

---

## annualDiv 維護（每年 6–8 月更新一次）

除息季結束後用 `div` 模式重新抓取 index.html 的 TRACKED 陣列 `annualDiv` 欄位：

- **季配股**（台積電等）：scraper 自動取最近 4 筆加總
- **年配股**（聯電等）：scraper 取最新一筆
- **虧損無配息**：填 0

---

## 注意事項

- **只取近三年（約 36 個月）**數據
- goodinfo.tw 載入慢，Chrome MCP 方式需等待 6 秒再讀取
- ETF 的 PER 頁面 EPS 欄全是「-」，這是正常的，收盤價欄仍完整可用
- **StockBenefitConsistency.asp 和 StockPER.asp 已 404**，不要使用
- git push 由 Claude 自動執行，不需使用者手動操作
