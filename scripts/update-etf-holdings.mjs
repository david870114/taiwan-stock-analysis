/**
 * 從 TWSE 官方 API 抓取 0050 / 0056 / 00878 / 00919 持股的收盤價與漲跌幅，
 * 並自動更新各 ETF 分析頁的 HTML。
 * 每個交易日收盤後由 GitHub Action 自動執行。
 */
import { readFileSync, writeFileSync } from 'fs';

// ---------- 各 ETF 持股清單（stock id → ETF 陣列名稱對應由 HTML 解析） ----------

const ETF_INLINE = [
  { etf: '0056',  file: '0056_analysis.html',  arrayName: 'holdings0056'   },
  { etf: '00878', file: '00878_analysis.html',  arrayName: 'holdings'       },
  { etf: '00919', file: '00919_analysis.html',  arrayName: 'holdings00919'  },
];

// 0050 用獨立 prices 物件（不是 inline）
const IDS_0050 = [
  '2330','2454','2317','2308','2881','2882','2891',
  '3711','2412','2379','3034','2345','2382','2886','6669',
];

// ---------- 價格抓取 ----------

/** 從 TWSE afterTrading/STOCK_DAY 取得最新一個交易日的收盤價與漲跌幅 */
async function fetchTWSE(id) {
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${id}&response=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  if (!data.data?.length) return null;
  const last = data.data[data.data.length - 1];
  // 欄位：[日期, 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌價差, 成交筆數]
  const px      = parseFloat(last[6].replace(/,/g, ''));
  const chgPx   = parseFloat(last[7].replace(/,/g, '')) || 0;
  const prevPx  = px - chgPx;
  const chg     = prevPx > 0 ? parseFloat((chgPx / prevPx * 100).toFixed(2)) : 0;
  return { px, chg };
}

/** 上市股 TWSE 失敗時 fallback → MIS 即時 API（支援上市+上櫃） */
async function fetchMIS(id) {
  for (const ex of ['tse', 'otc']) {
    try {
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex}_${id}.tw`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' } });
      const data = await res.json();
      const s = data.msgArray?.[0];
      if (!s?.y || s.y === '-') continue;
      const px       = parseFloat(s.z && s.z !== '-' ? s.z : s.y);
      const prevClose = parseFloat(s.y);
      if (isNaN(px) || isNaN(prevClose) || prevClose === 0) continue;
      const chg = parseFloat(((px - prevClose) / prevClose * 100).toFixed(2));
      return { px, chg };
    } catch (_) {}
  }
  return null;
}

async function fetchPrice(id) {
  try {
    const r = await fetchTWSE(id);
    if (r) return r;
  } catch (_) {}
  return fetchMIS(id);
}

// ---------- HTML 解析與更新 ----------

/** 從 holdings 陣列的 JS 原始碼擷取所有 stock id */
function extractIds(html, arrayName) {
  const m = html.match(new RegExp(`const ${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  const ids = [];
  const re = /id:'(\d+)'/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) ids.push(hit[1]);
  return [...new Set(ids)];
}

/** 就地替換 HTML 裡 holdings 陣列內每個 entry 的 px / chg */
function updateInline(html, priceMap) {
  return html.replace(
    /(\{ id:'(\d+)'[^}]*?),\s*px:\s*[\d,.]+,\s*chg:\s*[+\-]?\s*[\d.]+(\s*\})/g,
    (match, prefix, id, suffix) => {
      const p = priceMap[id];
      if (!p?.px) return match;
      return `${prefix}, px:${p.px}, chg:${p.chg}${suffix}`;
    }
  );
}

/** 更新 0050 的獨立 prices 物件 */
function update0050(html, priceMap, date) {
  const lines = IDS_0050.map(id => {
    const p = priceMap[id];
    return p
      ? `  '${id}': { px: ${p.px}, chg: ${p.chg} },`
      : `  '${id}': { px: null, chg: null },`;
  }).join('\n');
  const newBlock = `// Auto-updated: ${date}\nconst holdings0050_prices = {\n${lines}\n};`;
  return html.replace(
    /\/\/ Auto-updated:.*?\nconst holdings0050_prices = \{[\s\S]*?\};/,
    newBlock
  );
}

// ---------- main ----------

async function main() {
  const date = new Date().toISOString().split('T')[0];

  // 1. 收集所有需要抓取的 stock id
  const allIds = new Set(IDS_0050);
  const htmlCache = {};

  for (const { etf, file, arrayName } of ETF_INLINE) {
    const html = readFileSync(file, 'utf-8');
    htmlCache[etf] = html;
    for (const id of extractIds(html, arrayName)) allIds.add(id);
  }
  console.log(`Fetching ${allIds.size} stocks...`);

  // 2. 批次抓取（每筆間隔 300ms 避免被 block）
  const priceMap = {};
  for (const id of allIds) {
    const info = await fetchPrice(id);
    if (info) {
      priceMap[id] = info;
      console.log(`  ${id}: ${info.px} (${info.chg >= 0 ? '+' : ''}${info.chg}%)`);
    } else {
      console.warn(`  ${id}: failed`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. 更新各 ETF HTML
  // --- 0050 ---
  const html0050 = readFileSync('0050_analysis.html', 'utf-8');
  writeFileSync('0050_analysis.html', update0050(html0050, priceMap, date), 'utf-8');
  console.log('✓ 0050_analysis.html');

  // --- 0056 / 00878 / 00919 ---
  for (const { etf, file } of ETF_INLINE) {
    const updated = updateInline(htmlCache[etf], priceMap);
    writeFileSync(file, updated, 'utf-8');
    console.log(`✓ ${file}`);
  }

  console.log(`\nAll done (${date})`);
}

main().catch(e => { console.error(e); process.exit(1); });
