/**
 * 法人動態爬蟲
 * 用法: node scrape_institutional.mjs
 * 輸出: institutional_data.json（放在 repo 根目錄）
 *
 * 資料來源：
 *  - 台股法人每日買賣超：https://goodinfo.tw/tw/index.asp
 *  - 三大法人個股買賣超前十名：https://goodinfo.tw/tw/StockList.asp?...
 */

import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// 支援本機（有 executablePath）和 GitHub Actions（用 bundled Chromium）
const IS_CI = process.env.CI === 'true';

let puppeteer;
if (IS_CI) {
  puppeteer = require('puppeteer');
} else {
  puppeteer = require('C:\\Users\\USER\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-puppeteer\\node_modules\\puppeteer');
}

const CHROME_PATH = IS_CI ? undefined : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'institutional_data.json');

const URLS = {
  market: 'https://goodinfo.tw/tw/index.asp',
  topBuyers: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E7%86%B1%E9%96%80%E6%8E%92%E8%A1%8C&INDUSTRY_CAT=%E4%B8%89%E5%A4%A7%E6%B3%95%E4%BA%BA%E7%B4%AF%E8%A8%88%E8%B2%B7%E8%B6%85%E5%BC%B5%E6%95%B8+%E2%80%93+%E7%95%B6%E6%97%A5%40%40%E4%B8%89%E5%A4%A7%E6%B3%95%E4%BA%BA%E7%B4%AF%E8%A8%88%E8%B2%B7%E8%B6%85%40%40%E4%B8%89%E5%A4%A7%E6%B3%95%E4%BA%BA%E8%B2%B7%E8%B6%85%E5%BC%B5%E6%95%B8+%E2%80%93+%E7%95%B6%E6%97%A5',
};

async function launchBrowser() {
  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--lang=zh-TW',
    ],
  };
  if (CHROME_PATH) launchOpts.executablePath = CHROME_PATH;
  return puppeteer.launch(launchOpts);
}

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7' });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  return page;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 從 goodinfo index.asp 抓三大法人市場整體買賣超 ──
async function scrapeMarket(browser) {
  const page = await setupPage(browser);
  try {
    await page.goto(URLS.market, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(7000);

    const result = await page.evaluate(() => {
      // 尋找含「外資」「投信」「自營商」的表格
      const data = { foreign: null, investment_trust: null, dealer: null, total: null, date: null };

      // 找到含三大法人數據的表格
      const allTables = Array.from(document.querySelectorAll('table'));
      for (const tbl of allTables) {
        const text = tbl.innerText;
        if (!text.includes('外資') || !text.includes('投信')) continue;

        const rows = Array.from(tbl.querySelectorAll('tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
          const rowText = cells.join(' ');

          // 嘗試抓日期
          if (/\d{4}\/\d{2}\/\d{2}/.test(rowText)) {
            const m = rowText.match(/(\d{4}\/\d{2}\/\d{2})/);
            if (m) data.date = m[1];
          }
          if (/\d{4}-\d{2}-\d{2}/.test(rowText)) {
            const m = rowText.match(/(\d{4}-\d{2}-\d{2})/);
            if (m) data.date = m[1].replace(/-/g, '/');
          }

          // 抓數值：找包含外資/投信/自營商的行
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            if (c.includes('外資') && !c.includes('外資自營')) {
              // 找後面的數字
              for (let j = i + 1; j < cells.length; j++) {
                const val = cells[j].replace(/,/g, '');
                if (/^[+-]?\d+$/.test(val)) {
                  data.foreign = parseInt(val);
                  break;
                }
              }
            }
            if (c.includes('投信')) {
              for (let j = i + 1; j < cells.length; j++) {
                const val = cells[j].replace(/,/g, '');
                if (/^[+-]?\d+$/.test(val)) {
                  data.investment_trust = parseInt(val);
                  break;
                }
              }
            }
            if (c === '自營商' || c.includes('自營商(自行買賣)') || c.includes('自營商合計')) {
              for (let j = i + 1; j < cells.length; j++) {
                const val = cells[j].replace(/,/g, '');
                if (/^[+-]?\d+$/.test(val)) {
                  data.dealer = parseInt(val);
                  break;
                }
              }
            }
          }
        }
        // 找到有數值的表格就停止
        if (data.foreign !== null || data.investment_trust !== null) break;
      }

      // 如果沒從表格找到，嘗試全文解析
      if (data.foreign === null) {
        const bodyText = document.body.innerText;
        // 嘗試找「外資」後面的數字
        const foreignMatch = bodyText.match(/外資[^0-9-+]*([+-]?[\d,]+)/);
        if (foreignMatch) data.foreign = parseInt(foreignMatch[1].replace(/,/g, ''));

        const trustMatch = bodyText.match(/投信[^0-9-+]*([+-]?[\d,]+)/);
        if (trustMatch) data.investment_trust = parseInt(trustMatch[1].replace(/,/g, ''));

        const dealerMatch = bodyText.match(/自營商[^0-9-+]*([+-]?[\d,]+)/);
        if (dealerMatch) data.dealer = parseInt(dealerMatch[1].replace(/,/g, ''));
      }

      // 計算合計
      const vals = [data.foreign, data.investment_trust, data.dealer].filter(v => v !== null);
      if (vals.length >= 2) {
        data.total = vals.reduce((a, b) => a + b, 0);
      }

      return data;
    });

    return result;
  } finally {
    await page.close();
  }
}

// ── 從 StockList 抓三大法人個股買超前十名 ──
async function scrapeTopBuyers(browser) {
  const page = await setupPage(browser);
  try {
    await page.goto(URLS.topBuyers, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);

    const result = await page.evaluate(() => {
      const stocks = [];

      const allTables = Array.from(document.querySelectorAll('table'));
      let dataTable = null;

      for (const tbl of allTables) {
        const text = tbl.innerText;
        // 找含「代號」「買超」的表格
        if (text.includes('代號') && (text.includes('買超') || text.includes('法人'))) {
          dataTable = tbl;
          break;
        }
      }

      if (!dataTable) return stocks;

      const rows = Array.from(dataTable.querySelectorAll('tr'));
      let headerParsed = false;
      let codeIdx = -1, nameIdx = -1, netIdx = -1, priceIdx = -1, changeIdx = -1;

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
        if (cells.length < 3) continue;

        // 找表頭
        if (!headerParsed) {
          for (let i = 0; i < cells.length; i++) {
            if (cells[i].includes('代號')) codeIdx = i;
            if (cells[i].includes('名稱') || cells[i].includes('股票')) nameIdx = i;
            if (cells[i].includes('買超') && !cells[i].includes('賣超')) netIdx = i;
            if (cells[i].includes('收盤') || cells[i] === '股價') priceIdx = i;
            if (cells[i].includes('漲跌')) changeIdx = i;
          }
          if (codeIdx >= 0 && netIdx >= 0) {
            headerParsed = true;
            continue;
          }
          // 直接嘗試第一列含數字的行
          if (/^\d{4}$/.test(cells[0])) {
            codeIdx = 0; nameIdx = 1; netIdx = 2; priceIdx = 3; changeIdx = 4;
            headerParsed = true;
          }
        }

        if (!headerParsed) continue;

        // 資料行
        const code = codeIdx >= 0 ? cells[codeIdx] : cells[0];
        if (!/^\d{4,5}$/.test(code)) continue;

        const name = nameIdx >= 0 ? cells[nameIdx] : cells[1];
        const netRaw = netIdx >= 0 ? cells[netIdx] : cells[2];
        const net = parseInt((netRaw || '0').replace(/,/g, '')) || 0;
        const price = priceIdx >= 0 ? parseFloat(cells[priceIdx]) || null : null;
        const change = changeIdx >= 0 ? cells[changeIdx] : null;

        if (stocks.length < 10) {
          stocks.push({ code, name, net, price, change });
        }
      }

      return stocks;
    });

    return result;
  } finally {
    await page.close();
  }
}

// ── 主程式 ──
async function main() {
  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\//g, '/');

  console.error(`[scrape] 開始抓取法人動態，日期：${today}`);

  // 讀取現有資料（保留歷史）
  let existing = { lastUpdated: null, market: null, topBuyers: [], history: [] };
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(require('fs').readFileSync(OUTPUT_PATH, 'utf8'));
    } catch (e) {
      console.error('[scrape] 讀取現有 JSON 失敗，重新建立');
    }
  }

  const browser = await launchBrowser();
  let marketData = null;
  let topBuyers = [];

  try {
    // 抓市場整體
    console.error('[scrape] 抓取市場整體法人買賣超...');
    marketData = await scrapeMarket(browser);
    console.error('[scrape] 市場資料：', JSON.stringify(marketData));

    await wait(5000); // 避免流量限制

    // 抓個股前十名
    console.error('[scrape] 抓取個股法人買超前十名...');
    topBuyers = await scrapeTopBuyers(browser);
    console.error(`[scrape] 取得 ${topBuyers.length} 筆個股資料`);

  } finally {
    await browser.close();
  }

  // 更新歷史（保留最近 30 天）
  const history = existing.history || [];
  if (existing.market && existing.lastUpdated !== today) {
    history.unshift({ date: existing.lastUpdated, market: existing.market });
    if (history.length > 30) history.length = 30;
  }

  const output = {
    lastUpdated: today,
    market: marketData || existing.market,
    topBuyers: topBuyers.length > 0 ? topBuyers : existing.topBuyers,
    history,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.error(`[scrape] 完成，已寫入 ${OUTPUT_PATH}`);
  console.log(JSON.stringify({ success: true, date: today, topBuyersCount: topBuyers.length }));
}

main().catch(e => {
  console.error('[scrape] 錯誤：', e.message);
  process.exit(1);
});
