/**
 * 從 TWSE 官方 API 抓取 0050 前 15 大持股的收盤價與漲跌幅，
 * 更新 0050_analysis.html 內的 holdings0050_prices 物件。
 * 每個交易日收盤後由 GitHub Action 自動執行。
 */
import { readFileSync, writeFileSync } from 'fs';

const TOP15 = [
  '2330','2454','2317','2308','2881','2882','2891',
  '3711','2412','2379','3034','2345','2382','2886','6669',
];

async function fetchPrice(id) {
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${id}&response=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();

  if (!data.data?.length) return null;

  const rows = data.data;
  const last = rows[rows.length - 1];

  // STOCK_DAY 欄位：[日期, 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌價差, 成交筆數]
  const px = parseFloat(last[6].replace(/,/g, ''));
  const chgPriceStr = last[7].replace(/,/g, '');
  const chgPrice = parseFloat(chgPriceStr) || 0;
  const prevPx = px - chgPrice;
  const chg = prevPx > 0 ? parseFloat((chgPrice / prevPx * 100).toFixed(2)) : 0;

  return { px, chg };
}

async function main() {
  const results = {};

  for (const id of TOP15) {
    try {
      const info = await fetchPrice(id);
      if (info) {
        results[id] = info;
        console.log(`${id}: ${info.px} (${info.chg > 0 ? '+' : ''}${info.chg}%)`);
      } else {
        console.warn(`${id}: no data`);
      }
    } catch (e) {
      console.warn(`${id}: ${e.message}`);
    }
    // TWSE 流量限制
    await new Promise(r => setTimeout(r, 400));
  }

  if (Object.keys(results).length === 0) {
    console.log('No data fetched, skipping update.');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const lines = TOP15.map(id => {
    const p = results[id];
    return p
      ? `  '${id}': { px: ${p.px}, chg: ${p.chg} },`
      : `  '${id}': { px: null, chg: null },`;
  }).join('\n');

  const newBlock =
    `// Auto-updated: ${date}\nconst holdings0050_prices = {\n${lines}\n};`;

  let html = readFileSync('0050_analysis.html', 'utf-8');
  html = html.replace(
    /\/\/ Auto-updated:.*?\nconst holdings0050_prices = \{[\s\S]*?\};/,
    newBlock
  );
  writeFileSync('0050_analysis.html', html, 'utf-8');
  console.log(`✓ 0050_analysis.html updated (${date})`);
}

main().catch(e => { console.error(e); process.exit(1); });
