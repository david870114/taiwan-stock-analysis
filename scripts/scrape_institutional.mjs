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

// ── 三大法人市場整體買賣超：證交所 BFI82U（官方 JSON，單位：億元）──
// GoodInfo index.asp 自 2026/08/19 起解析失敗（全為 null），且原解析結果單位不明，改用官方資料。
// 每次重建最近 7 個交易日，不依賴前一天的 JSON。
const toYi = (v) => Math.round(parseInt(String(v).replace(/,/g, ''), 10) / 1e6) / 100; // 元 → 億元（2 位小數）

async function fetchTwseMarketDay(ymd) {
  const url = `https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ymd}&response=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`TWSE BFI82U HTTP ${res.status}`);
  const j = await res.json();
  if (j.stat !== 'OK' || !Array.isArray(j.data)) return null; // 非交易日
  const row = (prefix) => j.data.find(r => r[0].startsWith(prefix));
  const net = (prefix) => { const r = row(prefix); return r ? toYi(r[3]) : null; };
  const dealerSelf = net('自營商(自行買賣)'), dealerHedge = net('自營商(避險)');
  return {
    foreign: net('外資及陸資'),
    investment_trust: net('投信'),
    dealer: dealerSelf === null && dealerHedge === null ? null : Math.round(((dealerSelf || 0) + (dealerHedge || 0)) * 100) / 100,
    total: net('合計'),
    date: `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`,
    unit: '億元',
  };
}

// 備援：FinMind TaiwanStockTotalInstitutionalInvestors（一次取多日）
async function fetchFinmindMarketDays(startDate) {
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockTotalInstitutionalInvestors&start_date=${startDate}`;
  const j = await (await fetch(url)).json();
  if (j.status !== 200) throw new Error(`FinMind ${j.msg}`);
  const byDate = {};
  for (const r of j.data) (byDate[r.date] ||= {})[r.name] = r.buy - r.sell;
  return Object.keys(byDate).sort().reverse().map(d => {
    const x = byDate[d], yi = (v) => (v == null ? null : Math.round(v / 1e6) / 100);
    return {
      foreign: yi(x.Foreign_Investor), investment_trust: yi(x.Investment_Trust),
      dealer: yi((x.Dealer_self || 0) + (x.Dealer_Hedging || 0)), total: yi(x.total),
      date: d.replace(/-/g, '/'), unit: '億元',
    };
  });
}

async function fetchMarketHistory(days = 7) {
  const out = [];
  try {
    const now = new Date(Date.now() + 8 * 3600e3); // 台北時間
    for (let back = 0; back < 20 && out.length < days; back++) {
      const d = new Date(now.getTime() - back * 86400e3);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
      const m = await fetchTwseMarketDay(ymd);
      if (m) out.push(m);
      await wait(1500); // 證交所限流
    }
    if (out.length) return out;
  } catch (e) {
    console.error('[scrape] TWSE 市場資料失敗，改用 FinMind：', e.message);
  }
  const start = new Date(Date.now() - 20 * 86400e3).toISOString().slice(0, 10);
  return (await fetchFinmindMarketDays(start)).slice(0, days);
}

// ── 個股買超前 15 名備援：證交所 T86（僅上市，無股價）──
async function fetchTwseTopBuyers(ymd) {
  const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${ymd}&selectType=ALLBUT0999&response=json`;
  const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  if (j.stat !== 'OK') return [];
  const lots = (v) => Math.round(parseInt(String(v).replace(/,/g, ''), 10) / 1000);
  return j.data
    .map(r => ({ code: r[0].trim(), name: r[1].trim(), price: null, change: '', changePct: '',
      foreignNet: lots(r[4]), trustNet: lots(r[10]), dealerNet: lots(r[11]), totalNet: lots(r[18]) }))
    .sort((a, b) => b.totalNet - a.totalNet)
    .slice(0, 15)
    .map(s => s); // 股價於 fillTwsePrices 補上
}

// 用證交所 MI_INDEX（當日每日收盤行情）補收盤價與漲跌
async function fillTwsePrices(stocks, ymd) {
  try {
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ymd}&type=ALLBUT0999&response=json`;
    const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
    const t = (j.tables || []).find(t => Array.isArray(t.fields) && t.fields.includes('證券代號') && t.fields.includes('收盤價'));
    if (!t) return stocks;
    const f = (name) => t.fields.indexOf(name);
    const map = new Map(t.data.map(r => [r[f('證券代號')].trim(), r]));
    for (const s of stocks) {
      const r = map.get(s.code);
      if (!r) continue;
      const close = parseFloat(String(r[f('收盤價')]).replace(/,/g, ''));
      const diff = parseFloat(String(r[f('漲跌價差')]).replace(/,/g, '')) || 0;
      const sign = /-/.test(r[f('漲跌(+/-)')]) ? -1 : 1;
      if (isNaN(close)) continue;
      const chg = sign * diff, prev = close - chg;
      s.price = close;
      s.change = (chg > 0 ? '+' : '') + (+chg.toFixed(2));
      s.changePct = prev > 0 ? (chg >= 0 ? '+' : '') + (chg / prev * 100).toFixed(2) : '';
    }
  } catch (e) {
    console.error('[scrape] MI_INDEX 股價補值失敗：', e.message);
  }
  return stocks;
}

// ── （舊）從 goodinfo index.asp 抓三大法人市場整體買賣超，已停用 ──
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

  // 抓市場整體（證交所官方，最近 7 個交易日）
  console.error('[scrape] 抓取市場整體法人買賣超（TWSE）...');
  let marketDays = [];
  try {
    marketDays = await fetchMarketHistory(7);
    console.error('[scrape] 市場資料：', JSON.stringify(marketDays[0]));
  } catch (e) {
    console.error('[scrape] 市場資料全部失敗：', e.message);
  }

  // 抓個股前 15 名（GoodInfo 為主，被擋時改用證交所 T86）
  let topBuyers = [];
  try {
    const browser = await launchBrowser();
    try {
      console.error('[scrape] 抓取個股法人買超前15名（GoodInfo）...');
      topBuyers = await scrapeTopBuyers(browser);
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error('[scrape] GoodInfo 失敗：', e.message);
  }
  if (topBuyers.length === 0 && marketDays[0]) {
    console.error('[scrape] GoodInfo 無資料，改用 TWSE T86');
    try {
      const ymd = marketDays[0].date.replace(/\//g, '');
      topBuyers = await fillTwsePrices(await fetchTwseTopBuyers(ymd), ymd);
    } catch (e) { console.error('[scrape] T86 失敗：', e.message); }
  }
  console.error(`[scrape] 取得 ${topBuyers.length} 筆個股資料`);

  const latest = marketDays[0] || null;
  const output = {
    lastUpdated: latest ? latest.date : today,
    market: latest || existing.market,
    marketUnit: '億元',
    topBuyers: topBuyers.length > 0 ? topBuyers : existing.topBuyers,
    history: marketDays.length ? marketDays.slice(1).map(m => ({ date: m.date, market: m })) : (existing.history || []),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.error(`[scrape] 完成，已寫入 ${OUTPUT_PATH}`);
  console.log(JSON.stringify({ success: true, date: today, topBuyersCount: topBuyers.length }));
}

main().catch(e => {
  console.error('[scrape] 錯誤：', e.message);
  process.exit(1);
});
