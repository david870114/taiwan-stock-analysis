---
name: taiwan-stock-analysis
description: 台股個股深度分析 skill。當使用者說「分析 XXXX 股票」、「幫我看 XXXX」、「更新台股追蹤清單」、「新增 XXXX 到追蹤清單」、「更新智邦/台積電/元大台灣50」、「台股分析」等，立即使用此 skill。功能：自動搜尋 EPS、本益比歷史數據 → 產出 PER 河流圖互動分析頁（HTML）→ 更新總覽頁（index.html）→ 使用者上傳 GitHub Pages → Notion 只寫標題+連結。追蹤清單：0050、2330、2345（可動態新增）。每季財報後說「更新 XXXX」即可重新分析。
---

# 台股個股分析 Skill

## 系統架構

GitHub Pages: david870114/taiwan-stock-analysis
- index.html          ← 總覽頁（所有股票+即時股價）
- 2345_per_analysis_2026_2.html  ← 智邦個股分析頁
- 2330_analysis.html  ← 台積電個股分析頁
- 0050_analysis.html  ← 元大台灣50個股分析頁

即時股價：https://taiwan-stock-price.david870114.workers.dev/?id={代號}
Notion 父頁面 ID：3326c724-4010-80a7-9963-ffee7015caae

---

## 追蹤清單

| 代號 | 名稱 | 類別 | 估值方法 |
|------|------|------|---------|
| 0050 | 元大台灣50 | ETF | 殖利率法 |
| 2330 | 台積電 | AI/半導體 | PER法 |
| 2345 | 智邦 | AI/網通 | PER法 |

---

## 現有數據（已確認）

### 2345 智邦
- TTM EPS：47.11元（2025全年）
- 歷史PER：低21x / 均26x / 高32x（2023–2026）
- 便宜價：990 / 合理價：1,225 / 昂貴價：1,507

### 2330 台積電
- TTM EPS：66.26元
- 歷史PER：低17x / 均22x / 高28x（2023–2026）
- 便宜價：1,126 / 合理價：1,458 / 昂貴價：1,855

### 0050 元大台灣50
- 年配息：1.0元（分割後，2025年1拆4）
- 殖利率：高2.5% / 均2.0% / 低1.5%
- 便宜價：40 / 合理價：50 / 昂貴價：67

---

## 執行流程

### 情境A：分析新股票

1. **資料蒐集**（web_search）
   - "{代號} EPS 歷史 2021–2025"
   - "{代號} 本益比區間 歷史 低檔 高檔"
   - "{代號} 2026 EPS 法人預估"
   - 請使用者提供 goodinfo.tw 本益比河流圖截圖確認 PER 區間

2. **計算估值**
   - PER法：便宜/合理/昂貴價 = TTM EPS × 低/均/高PER
   - 殖利率法（ETF）：合理價 = 年配息 ÷ 均殖利率
   - 注意：0050 在2025年6月1拆4，用分割後數據

3. **產出個股分析 HTML**
   - 四個 Tab：PER河流圖、三情境買點、EPS趨勢、完整摘要
   - Y軸不加 NT$
   - PER 圖例：`PER 40x（昂貴）`、`PER 30x（偏貴）`、`PER 22x（合理）`、`PER 15x（便宜）`、`PER 10x（底部）`
   - 白色股價線設定 `spanGaps: true`
   - 左上角加「← 返回總覽」連結到 index.html
   - 檔名：`{代號}_analysis.html`

4. **更新 index.html 總覽頁**
   - 加入新股票列
   - JS stocks 陣列加入：`{ id: '{代號}', fairValue: X, expensiveValue: Y }`

5. **通知使用者上傳到 GitHub**
   - Add file → Upload files → Commit changes

6. **更新 Notion**
   - 父頁面下建子頁面
   - 內容只有：`🔗 [點此開啟台股追蹤總覽](https://david870114.github.io/taiwan-stock-analysis/)`

### 情境B：每季更新

1. 請使用者提供 goodinfo.tw 截圖
2. 讀取最新 TTM EPS 和 PER 區間
3. 重新計算估值
4. 更新個股 HTML + index.html
5. 通知使用者上傳覆蓋

### 情境C：新增股票

1. 加入追蹤清單表格
2. 執行情境A

---

## 類別判斷規則

- 00xx → ETF
- 2330、2303、2379 等 → AI／半導體
- 2345、網通類 → AI／網通
- 2881–2892 等 → 金融股
- 其他 → 其他

---

## 重要注意事項

- Notion 只存 GitHub Pages 連結，不寫詳細分析
- 本益比歷史區間取近 3–5 年，排除異常高點
- PER 數據來源：goodinfo.tw 本益比河流圖（使用者截圖）
- index.html 每分鐘自動抓取即時股價
- GitHub 上傳由使用者手動執行
