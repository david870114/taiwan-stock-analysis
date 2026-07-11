---
name: taiwan-stock-analysis
description: 台股個股深度分析 skill。當使用者說「分析 XXXX 股票」、「幫我看 XXXX」、「更新台股追蹤清單」、「新增 XXXX 到追蹤清單」、「更新智邦/台積電/元大台灣50/緯創」、「台股分析」等，立即使用此 skill。功能：從 goodinfo.tw 自動抓取數據 → 產出 PER/殖利率河流圖互動分析頁（HTML）→ 同步更新總覽頁（index.html）→ git push 上傳 GitHub Pages。追蹤清單：0050、0056、00878、00919、00981A、2330、2345、2382、3231 等 30+ 檔（完整清單見正文，可動態新增）。每季財報後說「更新 XXXX」即可重新分析。
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
| 006208 | 富邦台50 | ETF（同台灣50指數，未分割）| 殖利率法 | 006208_analysis.html |
| 0056 | 元大高股息 | ETF | 殖利率法 | 0056_analysis.html |
| 00878 | 國泰永續高股息 | ETF | 殖利率法 | 00878_analysis.html |
| 00919 | 群益台灣精選高息 | ETF | 殖利率法 | 00919_analysis.html |
| 00981A | 主動統一台股增長 | ETF | 殖利率法（季配 0.63×4）| 00981A_analysis.html |
| 00991A | 主動復華未來50 | ETF | 價格追蹤（無配息）| 00991A_analysis.html |
| 00631L | 元大台灣50正2 | ETF（單日正向2倍槓桿） | 價格追蹤（不配息，1拆22還原）| 00631L_analysis.html |
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
| 2454 | 聯發科 | AI/IC設計 | PER法 | 2454_analysis.html |
| 2492 | 華新科 | 被動元件/MLCC | PER法 | 2492_analysis.html |
| 3017 | 奇鋐 | AI/散熱 | PER法 | 3017_analysis.html |
| 3037 | 欣興 | ABF載板 | PER法 | 3037_analysis.html |
| 3231 | 緯創 | AI/伺服器 | PER法 | 3231_analysis.html |
| 3260 | 威剛 | 記憶體模組 | PER法 | 3260_analysis.html |
| 3324 | 雙鴻 | AI/散熱 | PER法 | 3324_analysis.html |
| 3481 | 群創 | 面板 | PER法 | 3481_analysis.html |
| 3596 | 智易 | AI/網通 | PER法 | 3596_analysis.html |
| 6239 | 力成 | 封測（記憶體封測龍頭/FOPLP）| PER法 | 6239_analysis.html |
| 6669 | 緯穎 | AI/伺服器 | PER法 | 6669_analysis.html |
| 6770 | 力積電 | 晶圓代工 | PER法 | 6770_analysis.html |
| 8046 | 南電 | ABF載板 | PER法 | 8046_analysis.html |
| 8210 | 勤誠 | AI/機殼 | PER法 | 8210_analysis.html |
| 1303 | 南亞 | 石化（非AI分頁） | PER法 | 1303_analysis.html |
| 1519 | 華城 | 重電/電力設備（非AI分頁） | PER法 | 1519_analysis.html |

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
4. 同步更新 index.html（個股四處 / ETF 五處，見下方）
5. **若新增的是 ETF → 必須觸發 ETF 子分頁工具**：把月線收盤、配息資訊寫進 `ETF_DATA` 陣列（見「ETF 子分頁」章節），河流圖比較、除息行事曆、成長率欄、試算工具才會出現這檔 ETF
6. 更新 SKILL.md 追蹤清單（CLAUDE.md 只是指標檔，不用改）
7. **先 `git pull --ff-only`**（repo 有每日自動 commit 的 GitHub Actions，不 pull 會 push 失敗）→ `git add . && git commit -m "新增 {代號} 分析" && git push`

### 每季更新流程

1. 判斷 ETF 或個股 → 選對應資料蒐集方式
2. 補充最新月份數據，重新計算估值
3. 更新分析 HTML + index.html
4. **若是 ETF → 一併把最新月份收盤補進 `ETF_DATA[].raw`**，並視情況更新 `annualDiv`（河流圖、成長率欄才會反映最新月）
5. **先 `git pull --ff-only`** → `git add . && git commit -m "更新 {代號} 分析" && git push`

---

## HTML 規範（五個 Tab，缺一不可）

### 個股（PER 法）— 參考 2345_per_analysis_2026.html

- Tab：📈 PER 河流圖 ／ 🎯 三情境買點 ／ 📊 EPS 趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- EPS 趨勢 Tab 含逐月明細表格（月份、收盤、EPS、PER、各倍數換算值）
- 基本面分析 Tab：公司營運（含毛利率趨勢表）、商業模式、市場地位、估值指標（含即時 P/E fetch）

### ETF（殖利率法）— 參考 00878_analysis.html / 0056_analysis.html

- Tab：📈 殖利率河流圖 ／ 🎯 三情境買點 ／ 📊 配息趨勢 ／ 🏦 持股資訊 ／ 🏢 基本面分析
- **完整摘要已合併進基本面分析，不再獨立一個 Tab**
- 殖利率帶以 TTM annualDiv 計算，標示各殖利率區間對應價格
- 配息趨勢 Tab 含逐季配息明細表格
- **持股資訊 Tab（ETF 專用，必須包含）：**
  - 資料來源：`https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID={代號}`（Chrome MCP 抓取）
  - 產業分布 Doughnut 圓餅圖（Chart.js）
  - 前 15 大持股水平橫條圖（indexAxis: 'y'）
  - 完整持股表格（代號、名稱、比重、股價、漲跌、比重視覺條）
  - 基金基本規格 grid（標的指數、成分股數、前十大合計比重、基金規模）

  **持股 bar chart 顏色規則（依產業，不用漲跌顏色）：**
  | 產業 | 顏色 |
  |------|------|
  | 金融保險業 | `#3b82f6` 藍 |
  | 半導體業 | `#22c55e` 綠 |
  | 電腦及週邊 | `#f59e0b` 琥珀 |
  | 航運業 | `#8b5cf6` 靛 |
  | 通信網路業 | `#ec4899` 粉 |
  | 電子零組件 | `#a855f7` 紫（或 `#f97316` 橙，依各ETF） |
  | 電子通路業 | `#06b6d4` 青 |
  | 食品工業 | `#10b981` 翠綠 |
  | 其他 | `#64748b` 灰 |

  **持股 bar chart 右側股價標籤（afterDatasetsDraw plugin）：**
  ```javascript
  // holdings 陣列須有 px, chg 欄位（手動維護，定期更新）
  const barLabelPlugin_{ETF} = {
    id: 'barLabel{ETF}',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.getDatasetMeta(0).data.forEach((bar, j) => {
        const h = top15_{ETF}[j];
        if (!h || h.px == null) return;
        const clr = h.chg > 0 ? '#22c55e' : h.chg < 0 ? '#ef4444' : '#94a3b8';
        const txt = `${h.px.toLocaleString()} (${h.chg > 0 ? '+' : ''}${h.chg}%)`;
        ctx.save();
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillStyle = clr;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bar.x + 4, bar.y);
        ctx.restore();
      });
    }
  };
  // new Chart(..., { plugins: [barLabelPlugin_{ETF}], options: { layout: { padding: { right: 140 } }, ... } })
  ```
  - **0050 例外**：holdings 無 px/chg，改用即時 API fetch 顯示股價（無漲幅），fetch 後 `holdingsChart0050.update()`
- 基本面分析 Tab 包含：估值現況（即時殖利率 fetch）、年化配息趨勢表、ETF策略說明、利多vs風險、同類ETF比較表、操作策略建議、關鍵數據快查表
- **河流圖 tooltip**：必須加 `interaction: { mode: 'index', intersect: false }` 讓滑鼠移到任意位置都會顯示數據（只加到第一個 chart，不加到 bar chart 或 donut chart）

### 主動式 ETF（無配息，noDivYet: true）

新掛牌、尚無配息歷史的主動式 ETF（如 00991A）使用**價格追蹤法**，不用殖利率法（00981A 已於 2026 開始季配，改用殖利率法）：
- 分析頁：顯示價格走勢圖 + 三情境評估（以價格區間判斷便宜/合理/昂貴）
- index.html TRACKED 陣列使用 `noDivYet: true`，`annualDiv: null`
- `buildEtfTable()` 對此類 ETF 顯示「尚無配息 / 價格追蹤 / 待宣告」，不計算殖利率
```javascript
{ id:'00991A', name:'主動復華未來50', tier:'core', fairValue:19, expValue:25,
  fairPER:null, tp:null, cheapValue:14, annualDiv:null, noDivYet:true,
  url:'00991A_analysis.html' }
```

### 槓桿型 ETF（單日正向2倍，如 00631L）

槓桿型 ETF **永不配息**，同樣用價格追蹤法（`noDivYet:true` / ETF_DATA `noDiv:true`），但有兩點特別注意：
- **分割還原**：00631L 於 2026/03/31 進行 **1 拆 22** 分割（分割前 ~443 元 → 後 ~20 元）。GoodInfo 月線顯示的原始價在分割月會出現 -96% 假跌幅，**必須把分割前（26M02 含以前）的收盤全部 ÷22 還原**，才能讓走勢連續、成長率正確。每季更新只需補最新月（已是分割後價，免再除）。
- **分析頁重點**：強調「單日 2 倍 ≠ 長期 2 倍」、波動耗損（volatility decay）、路徑相依、須停損紀律、不可無腦長抱；Tab 用 價格走勢／三情境評估／月線報酬／持股結構／槓桿風險解析。

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

## index.html 更新（個股改四處 / ETF 改五處）

**1. 對應 section 的 tbody 加新列**

- **個股**：在對應產業 section 的 `<tbody>` 手動加一列。**非 AI 產業鏈個股（重電、塑化、傳產、金融等）放在「🏭 非AI產業鏈」分頁（`tab-nonai`）內的 section**，AI 供應鏈個股放在主追蹤清單分頁（`tab-watchlist`）：
```html
<td class="code">{代號}</td>
<td class="name"><a href="{代號}_analysis.html">{名稱}</a></td>
<td>{便宜價} <span class="per-sub">...</span></td>
<td>{合理價} <span class="per-sub">...</span></td>
<td>{昂貴價} <span class="per-sub">...</span></td>
<td class="price-cell loading td-cur" id="price-{代號}">…</td>
<td id="vs-{代號}" class="loading">—</td>
<td class="td-tp">—</td>
```
- **ETF**：**不用手動加列**。ETF 表格在「📈 ETF 追蹤與配息試算」子分頁，由 `buildEtfTable()` 從 TRACKED 自動產生（含 1個月/3個月/半年/1年/3年成長率欄），只要改 TRACKED（第 3 處）即自動同步。

**2. STOCKS 陣列**
```javascript
{ id:'{代號}', fairValue:X, expValue:Y },
```

**3. TRACKED 陣列**
```javascript
{ id:'{代號}', name:'{名稱}', tier:'core'/'growth'/'spec', fairValue:X, expValue:Y, fairPER:null/N, tp:null, cheapValue:Z, annualDiv:D },
```

**4. CHAIN_STOCKS 陣列**（僅 AI 供應鏈個股加入——對應「AI 供應鏈」mini-card 區塊；傳產/金融/被動元件不加，ETF 視情況）
```javascript
'{代號}'
```

**5. ETF_DATA 陣列（僅 ETF，新增 ETF 必加，見下方「ETF 子分頁」章節）**

---

## ETF 子分頁（新增 ETF 必須觸發）

「📈 ETF 追蹤與配息試算」子分頁包含四塊，全部由 index.html 內的 **`ETF_DATA` 陣列**驅動：

1. **ETF 追蹤清單**（殖利率估值 + 月線成長率欄）
2. **河流圖比較**（殖利率% / 實際價格 / 成長率% 三模式，可隱藏顯示、tooltip 依數值上到下排序）
3. **除息行事曆**（橫式 1–12 月，列出每月所有除息 ETF）
4. **存股／配息試算工具**（資金→配息、月領→所需資金，含「⭐ 成長＋殖利率推薦」組合）

### 新增一檔 ETF → 在 `ETF_DATA` 加一個物件

```javascript
{ id:'{代號}', name:'{名稱}', color:'{HEX}', annualDiv:{年化配息}, freq:{年配息次數}, divMonths:[{除息月份}], est:{除息月份是否為推估 true/省略},
  raw:{ '23M07':px, '23M08':px, ... , '26M06':px } },   // 近三年逐月收盤（key 用 YYMMM 格式）
```

欄位說明：
- `color`：圖表用，沿用既有色票避免撞色 — 0050 `#3b82f6`、0056 `#22c55e`、00878 `#f59e0b`、00919 `#ec4899`、00981A `#a855f7`、00991A `#06b6d4`；新 ETF 另選 `#14b8a6`/`#eab308`/`#f97316` 等
- `annualDiv` / `freq`：年化配息與年配息次數（季配 4、半年配 2、年配 1）；行事曆每月每張單次配息 = `annualDiv / freq × 1000`
- `divMonths`：除息月份陣列（季配範例：0056 `[1,4,7,10]`、00878 `[2,5,8,11]`、00919 `[3,6,9,12]`）；月份不確定時填上推估值並加 `est:true`
- `raw`：近三年逐月收盤，月份 key 格式 `YYMMM`（如 `26M06`）。**直接沿用該 ETF 分析頁裡 `const data` 的月線**（把 `{m:'26M06',px:49.62}` 轉成 `'26M06':49.62`）
- **無配息的主動式 ETF**（如 00991A）：`annualDiv:null, noDiv:true`，省略 `freq`/`divMonths`；只在「實際價格／成長率」模式畫線，不進行事曆與試算

### 成長率欄資料來源

成長率（1個月～3年）由 `ETF_DATA[].raw` 的月線收盤即時計算，**不需另外抓 FinMind**。每季更新分析頁時，把最新月份補進對應 ETF 的 `raw`，成長率與河流圖即自動更新。

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
