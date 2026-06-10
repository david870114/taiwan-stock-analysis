---
name: taiwan-stock-analysis
description: 台股個股深度分析 skill。當使用者說「分析 XXXX 股票」、「幫我看 XXXX」、「更新台股追蹤清單」、「新增 XXXX 到追蹤清單」、「更新智邦/台積電/元大台灣50/緯創」、「台股分析」等，立即使用此 skill。功能：從 goodinfo.tw 自動抓取數據 → 產出 PER/殖利率河流圖互動分析頁（HTML）→ 同步更新總覽頁（index.html）→ git push 上傳 GitHub Pages。追蹤清單：0050、0056、00919、2330、2337、2345、2382、3231、3596（可動態新增）。每季財報後說「更新 XXXX」即可重新分析。
---

# 台股個股分析 Skill

## 系統架構

GitHub Pages: david870114/taiwan-stock-analysis
- index.html — 總覽頁（所有股票 + 即時股價，每分鐘自動更新）
- {代號}_analysis.html — 個股/ETF 分析頁
- 即時股價 API：https://taiwan-stock-price.david870114.workers.dev/?id={代號}
- Repo 路徑：C:\Users\USER\Desktop\taiwan-stock-analysis\
- Scraper：`node "C:\Users\USER\goodinfo_scraper.mjs" {代號} per|div|detail`

---

## ⚡ 先判斷 ETF 或個股，再選對應資料蒐集方式

| 代號格式 | 類型 | 估值方法 |
|---------|------|---------|
| 00xx（0050、0056、00919 等） | ETF | **殖利率法** |
| 4位數字（2330、2345 等） | 個股 | **PER 法** |

### ETF 資料蒐集

**步驟一：抓配息歷史**
```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" {代號} div
```
回傳 `annualDiv`（TTM 近四季年化配息）與逐季配息明細。

**步驟二：抓月線股價**
Chrome MCP 開啟 goodinfo PER 頁面，ETF 的 EPS 欄全是「-」屬正常，**收盤價欄完整可用**：
```
navigate → https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}
等待 6 秒 → get_page_text → 讀取逐月「收盤價」欄
```

**步驟三：計算殖利率區間**
```
殖利率 = annualDiv ÷ 收盤價 × 100%
找出近三年高/均/低殖利率
便宜價 = annualDiv ÷ 高殖利率
合理價 = annualDiv ÷ 均殖利率
昂貴價 = annualDiv ÷ 低殖利率
```

### 個股資料蒐集

**步驟一：抓 PER 河流圖數據**
```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" {代號} per
```
或 Chrome MCP：
```
navigate → https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}
等待 6 秒 → get_page_text
```

**步驟二：正確讀取 EPS（重要！）**

| 欄位 | 內容 | 能否用於河流圖？ |
|------|------|----------------|
| 「近四季EPS」欄 | 當下最新 TTM，全表同一個值 | ❌ 季中月會不同 |
| 「本益比換算價格 10x」欄 ÷ 10 | 每月不同，河流圖實際用的值 | ✅ 正確 |

季末月（M03/M06/M09/M12）兩欄應相等，可交叉驗證。

**步驟三：抓配息數據**
```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" {代號} div
```

**步驟四：計算 PER 區間**
```
取近三年逐月 PER，找低/均/高，排除短暫題材異常高點
便宜/合理/昂貴價 = 最新季末 EPS × 低/均/高 PER
```

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

## 執行流程

### 觸發關鍵字對應

- 「新增 {代號}」/ 「分析 {代號}」→ 新增流程
- 「更新 {代號}」→ 每季更新流程
- 若代號已在追蹤清單中 → 執行更新，不重複新增

### 新增流程

1. 判斷 ETF 或個股 → 選對應資料蒐集方式（見上方）
2. 抓取數據（全自動，不需使用者截圖）
3. 產出分析 HTML（五個 Tab，見下方規範）
4. 同步更新 index.html（四處，見下方）
5. 更新 SKILL.md 與 CLAUDE.md 追蹤清單
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
- 基本面分析 Tab：公司營運（含毛利率趨勢表）、商業模式、市場地位、估值指標（含即時 P/E fetch）

### ETF（殖利率法）— 參考 0056_analysis.html / 00919_analysis.html

- Tab：📈 殖利率河流圖 ／ 🎯 三情境買點 ／ 📊 配息趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- 殖利率帶以 TTM annualDiv 計算，標示各殖利率區間對應價格
- 配息趨勢 Tab 含逐季配息明細表格

### 共用規範

- 字型：`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 背景：`#0f1117`，文字：`#e2e8f0`，卡片：`#1e2535`
- Tab 樣式：圓角 pill button，active 用 `#3b82f6`
- 左上角「← 返回總覽」連結到 index.html
- Chart.js CDN：`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js`
- 白色股價線 `spanGaps: true`，Y 軸不加 NT$
- 基本面 Tab 即時 fetch 範例：
```javascript
async function updateLiveMetric() {
  const res = await fetch('https://taiwan-stock-price.david870114.workers.dev/?id={代號}', { cache: 'no-cache' });
  const data = JSON.parse(await res.text());
  const price = parseFloat(data.price);
  // 個股：pe = price / ttmEPS
  // ETF：yield = annualDiv / price * 100
}
window.addEventListener('load', updateLiveMetric);
```

---

## index.html 更新（每次新增/更新必須改四處）

**1. 對應 section 的 tbody 加新列**
```html
<td class="code code-etf">{代號}</td>  <!-- ETF 用 code-etf，個股用 code -->
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
- 2330、2303 等 → AI/半導體
- 2345、3596 等 → AI/網通
- 2382、3231、6669 等 → AI/伺服器
- 3017、3324 等 → AI/散熱
- 2881–2892 等 → 金融股
- 其他 → 依產業判斷

---

## annualDiv 維護（每年 6–8 月更新一次）

除息季結束後用 `div` 模式重新抓取 index.html TRACKED 陣列的 `annualDiv`：
- **季配股**（台積電等）：scraper 自動取最近 4 筆加總
- **年配股**（聯電等）：scraper 取最新一筆
- **虧損無配息**：填 0

---

## 注意事項

- **只取近三年（約 36 個月）**數據，不需要更早的歷史
- **GoodInfo 流量限制**：批次抓取需每支間隔 20 秒以上，封鎖約 1–2 小時後自動解除
- **ETF 的 PER 頁面 EPS 欄全是「-」**，這是正常的，收盤價欄仍完整可用
- Puppeteer MCP 雖設定但工具不會出現（Windows 已知問題），改用 PowerShell 執行 scraper
- **StockBenefitConsistency.asp 和 StockPER.asp 已 404**，不要使用
- git push 由 Claude 自動執行，不需使用者手動操作
