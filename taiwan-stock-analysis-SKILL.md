---
name: taiwan-stock-analysis
description: 台股個股深度分析 skill。當使用者說「分析 XXXX 股票」、「幫我看 XXXX」、「更新台股追蹤清單」、「新增 XXXX 到追蹤清單」、「更新智邦/台積電/元大台灣50/緯創」、「台股分析」等，立即使用此 skill。功能：從 goodinfo.tw 截圖逐月讀取數據 → 產出 PER 河流圖互動分析頁（HTML）→ 同步更新總覽頁（index.html）→ 使用者上傳 GitHub Pages。追蹤清單：0050、0056、00919、2330、2337、2345、2382、3231、3596（可動態新增）。每季財報後說「更新 XXXX」即可重新分析。
---

# 台股個股分析 Skill

## 系統架構

GitHub Pages: david870114/taiwan-stock-analysis
- index.html                   ← 總覽頁（所有股票+即時股價）
- {代號}_analysis.html         ← 個股/ETF 分析頁

即時股價：https://taiwan-stock-price.david870114.workers.dev/?id={代號}
Repo 路徑：C:\Users\USER\Desktop\taiwan-stock-analysis\
Scraper 路徑：C:\Users\USER\goodinfo_scraper.mjs

---

## ⚡ 資料蒐集：先判斷 ETF 或個股，再選對應方式

### 判斷規則

| 代號格式 | 類型 | 估值方法 |
|---------|------|---------|
| 00xx（0050、0056、00919 等） | ETF | **殖利率法** |
| 4位數字（2330、2345 等） | 個股 | **PER 法** |

---

### ETF 資料蒐集（殖利率法）

**步驟一：抓配息歷史**

```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" {代號} div
```

回傳 `annualDiv`（TTM 近四季年化配息）、逐季配息明細。

**步驟二：抓月線股價**

使用 Chrome MCP 開啟 goodinfo PER 頁面，ETF 的 EPS 欄為「-」但收盤價欄完整，逐月讀取即可：

```
Chrome MCP → https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}
等待 6 秒 → get_page_text → 讀取逐月「收盤價」欄
```

**步驟三：計算殖利率區間**

```
殖利率 = annualDiv ÷ 收盤價 × 100%
找出近三年殖利率最高（底部）/ 中段（合理）/ 最低（昂貴）區間
便宜價 = annualDiv ÷ 高殖利率
合理價 = annualDiv ÷ 均殖利率
昂貴價 = annualDiv ÷ 低殖利率
```

---

### 個股資料蒐集（PER 法）

**步驟一：抓 PER 河流圖數據**

```powershell
node "C:\Users\USER\goodinfo_scraper.mjs" {代號} per
```

或 Chrome MCP：

```
Chrome MCP → https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK_ID={代號}
等待 6 秒 → get_page_text → 讀取逐月「10x換算欄」與收盤價
```

**步驟二：正確讀取 EPS（重要！）**

```
河流圖 EPS = 10x 換算欄 ÷ 10（逐月不同，季中月≠近四季EPS欄）
季末月（M03/M06/M09/M12）可用「近四季EPS」欄交叉驗證
```

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

## 執行流程

### 情境A：分析新股票（含新增）

1. 判斷 ETF 或個股 → 選對應資料蒐集方式
2. 執行上方對應的資料蒐集步驟（全自動，不需使用者截圖）
3. 產出個股分析 HTML（五個 Tab，見下方 HTML 規範）
4. 同步更新 index.html（三處必須全部更新）
5. `git add . && git commit -m "新增 {代號} 分析" && git push`

### 情境B：每季更新

1. 判斷 ETF 或個股 → 選對應資料蒐集方式（同情境A步驟1-2）
2. 補充最新月份數據，重新計算估值
3. 更新個股 HTML + index.html
4. `git add . && git commit -m "更新 {代號} 分析" && git push`

### 情境C：新增股票

1. 執行情境A

---

## HTML 規範（五個 Tab，缺一不可）

### 個股分析頁（PER 法）
參考 `2345_per_analysis_2026.html`：
- Tab：📈 PER 河流圖 ／ 🎯 三情境買點 ／ 📊 EPS 趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- EPS 趨勢 Tab 含逐月明細表格（月份、收盤、EPS、PER、各倍數換算值）

### ETF 分析頁（殖利率法）
參考 `0056_analysis.html` 或 `00919_analysis.html`：
- Tab：📈 殖利率河流圖 ／ 🎯 三情境買點 ／ 📊 配息趨勢 ／ 🏢 基本面分析 ／ 📋 完整摘要
- 殖利率帶以 TTM annualDiv 計算，標示便宜/合理/昂貴帶
- 配息趨勢 Tab 含逐季配息明細表格

### 共用規範
- 字型：`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 背景：`#0f1117`，文字：`#e2e8f0`，卡片：`#1e2535`
- 左上角「← 返回總覽」連結
- Chart.js CDN：`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js`
- 白色股價線 `spanGaps: true`，Y 軸不加 NT$
- 基本面 Tab：即時 fetch 股價計算即時殖利率/PER

---

## index.html 更新（每次新增/更新都要改三處）

**1. 對應 section 的 tbody 加入新列**
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

**2. STOCKS 陣列加入**
```javascript
{ id:'{代號}', fairValue:X, expValue:Y },
```

**3. TRACKED 陣列加入**
```javascript
{ id:'{代號}', name:'{名稱}', tier:'core'/'growth'/'spec', fairValue:X, expValue:Y, fairPER:null/N, tp:null, cheapValue:Z, annualDiv:D },
```

**4. CHAIN_STOCKS 陣列加入（個股才需要，ETF 視情況）**
```javascript
'{代號}'
```

---

## 追蹤清單（目前）

| 代號 | 名稱 | 類別 | 估值方法 | 分析頁 |
|------|------|------|---------|-------|
| 0050 | 元大台灣50 | ETF | 殖利率法 | 0050_analysis.html |
| 0056 | 元大高股息 | ETF | 殖利率法 | 0056_analysis.html |
| 00919 | 群益台灣精選高息 | ETF | 殖利率法 | 00919_analysis.html |
| 2330 | 台積電 | AI/半導體 | PER法 | 2330_analysis.html |
| 2337 | 旺宏 | 記憶體 | PER法 | 2337_analysis.html |
| 2345 | 智邦 | AI/網通 | PER法 | 2345_per_analysis_2026.html |
| 2382 | 廣達 | AI/伺服器 | PER法 | 2382_analysis.html |
| 3231 | 緯創 | AI/伺服器 | PER法 | 3231_analysis.html |
| 3596 | 智易 | AI/網通 | PER法 | 3596_analysis.html |

---

## 注意事項

- **GoodInfo 流量限制**：批次抓取需每支間隔 20 秒以上，封鎖約 1–2 小時後自動解除
- **ETF 的 PER 頁面 EPS 欄全是「-」**，這是正常的，收盤價欄仍可用
- **只取近三年（約 36 個月）**數據，不需要更早的歷史
- **git push 自動上傳**，不需要使用者手動操作
- **季末月交叉驗證**：M03/M06/M09/M12 的 10x欄÷10 應等於「近四季EPS」欄
