\# 台股分析專案



\## 專案說明

這是台股 PER 河流圖分析專案，所有 HTML 分析頁放在此資料夾。



\## 自動化流程

當使用者說「更新 {股票代號}」時，依序執行：



1\. 用 Chrome MCP 前往以下網址，用 get_page_text 直接取得文字數據（不需截圖）：

&#x20;  - https://goodinfo.tw/tw/ShowK_ChartFlow.asp?RPT_CAT=PER&STOCK\_ID={代號}

&#x20;  （此頁含完整月度 PER 表格：收盤、近四季EPS、目前PER、10x/14x/.../30x換算價格）

&#x20;  注意：StockBenefitConsistency.asp 和 StockPER.asp 已 404，不要使用

2\. 從文字數據逐月讀取，依照 taiwan-stock-analysis-SKILL.md 的規則產出 HTML

3\. 更新 index.html 加入新股票連結

4\. 執行：

&#x20;  git add .

&#x20;  git commit -m "更新 {代號} 分析"

&#x20;  git push



\## GitHub Pages

網址：https://david870114.github.io/taiwan-stock-analysis/

Repo：https://github.com/david870114/taiwan-stock-analysis



\## 注意事項

\- goodinfo.tw 載入較慢，get_page_text 前等待 6 秒

\- 股票代號請補零至 4 碼

\- 數據讀取：月度 EPS 一律用「10x換算欄 ÷ 10」，季末月（M03/M06/M09/M12）可與「近四季EPS」欄交叉驗證

