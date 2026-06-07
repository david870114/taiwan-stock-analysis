\# 台股分析專案



\## 專案說明

這是台股 PER 河流圖分析專案，所有 HTML 分析頁放在此資料夾。



\## 自動化流程

當使用者說「更新 {股票代號}」時，依序執行：



1\. 用 Playwright 開啟瀏覽器，前往以下網址截圖：

&#x20;  - https://goodinfo.tw/tw/StockBenefitConsistency.asp?STOCK\_ID={代號}

&#x20;  - https://goodinfo.tw/tw/StockDetail.asp?STOCK\_ID={代號}

2\. 讀取截圖，依照 taiwan-stock-analysis-SKILL.md 的規則產出 HTML

3\. 更新 index.html 加入新股票連結

4\. 執行：

&#x20;  git add .

&#x20;  git commit -m "更新 {代號} 分析"

&#x20;  git push



\## GitHub Pages

網址：https://david870114.github.io/taiwan-stock-analysis/

Repo：https://github.com/david870114/taiwan-stock-analysis



\## 注意事項

\- goodinfo.tw 載入較慢，截圖前請等待 5 秒

\- 股票代號請補零至 4 碼

