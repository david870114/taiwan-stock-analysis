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
// 表格結構（TABLE 4）：
// 排名(0) | 代號(1) | 名稱(2) | 成交價(3) | 漲跌價(4) | 漲跌幅(5) | 成交張(6) |
// 法人日期(7) | 外資買(8) | 外資賣(9) | 外資超(10) |
// 投信買(11) | 投信賣(12) | 投信超(13) |
// 自營買(14) | 自營賣(15) | 自營超(16) |
// 合計買(17) | 合計賣(18) | 合計超(19) | 註記(20)
async function scrapeTopBuyers(browser) {
  const page = await setupPage(browser);
  try {
    await page.goto(URLS.topBuyers, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);

    const result = await page.evaluate(() => {
      const stocks = [];

      // 找含代號+法人資料的表格（資料行第一欄是排名數字，第二欄是4-6碼股票代號）
      const allTables = Array.from(document.querySelectorAll('table'));
      let dataTable = null;

      for (const tbl of allTables) {
        const firstDataRow = Array.from(tbl.querySelectorAll('tr')).find(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim());
          return cells.length >= 5 && /^\d+$/.test(cells[0]) && /^\d{4,6}[A-Z]?$/.test(cells[1]);
        });
        if (firstDataRow) { dataTable = tbl; break; }
      }

      if (!dataTable) return stocks;

      const rows = Array.from(dataTable.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
        if (cells.length < 10) continue;

        // 第0欄：排名數字，第1欄：股票代號
        if (!/^\d+$/.test(cells[0])) continue;
        const code = cells[1];
        if (!/^\d{4,6}[A-Z]?$/.test(code)) continue;

        const name      = cells[2] || '';
        const price     = parseFloat(cells[3]) || null;
        const change    = cells[4] || '';   // 漲跌價
        const changePct = cells[5] || '';   // 漲跌幅 (e.g. "+0.47")

        const parseNet = (v) => parseInt((v || '0').replace(/,/g, '')) || 0;

        // 各法人買賣超（固定欄位）
        let foreignNet = 0, trustNet = 0, dealerNet = 0, totalNet = 0;
        if (cells.length >= 20) {
          foreignNet = parseNet(cells[10]);
          trustNet   = parseNet(cells[13]);
          dealerNet  = parseNet(cells[16]);
          totalNet   = parseNet(cells[19]);
        } else {
          // fallback：嘗試末幾欄
          for (let i = cells.length - 2; i >= 8; i--) {
            const v = cells[i].replace(/,/g, '');
            if (/^[+-]?\d+$/.test(v) && Math.abs(parseInt(v)) > 0) {
              totalNet = parseInt(v);
              break;
            }
          }
        }

        const chgPctDisplay = changePct ? (changePct.startsWith('+') || changePct.startsWith('-') ? changePct : (parseFloat(changePct) >= 0 ? '+' + changePct : changePct)) : '';

        if (stocks.length < 15) {
          stocks.push({
            code, name, price,
            change,
            changePct: chgPctDisplay,
            foreignNet,
            trustNet,
            dealerNet,
            totalNet,
          });
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
    if (history.length > 7) history.length = 7;
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
