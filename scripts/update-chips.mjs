// 產生 chips.json — 首頁「近期操作排名」的籌碼面資料來源
// 資料：FinMind 公開 API（免 token）
//   TaiwanStockInstitutionalInvestorsBuySell → 外資 / 投信逐日買賣超（單位：股）
//   TaiwanStockPrice                          → 收盤價、成交量（用來標準化買超強度）
// 執行：node scripts/update-chips.mjs
// 時機：每個交易日收盤後（GitHub Actions update-institutional.yml 內自動執行）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.finmindtrade.com/api/v4/data';
const GAP_MS = 200;          // FinMind 約 300 次/小時，逐檔間隔避免瞬間打滿
const LOOKBACK_DAYS = 100;   // 取約 100 個日曆日，足夠湊到 20 個交易日

const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/var TRACKED = \[[\s\S]*?\n\];/);
if (!m) { console.error('找不到 TRACKED 陣列'); process.exit(1); }
const TRACKED = new Function(m[0] + '; return TRACKED;')();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(dataset, id, startDate) {
  const url = `${API}?dataset=${dataset}&data_id=${id}&start_date=${startDate}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 402 || res.status === 429) { await sleep(3000); continue; }
      const json = await res.json();
      if (json.status === 200) return json.data || [];
    } catch (e) { /* 單檔失敗不中斷整批 */ }
    await sleep(1000);
  }
  return null;
}

// 逐日彙總：回傳 [{ date, foreign, trust, close, vol }]，單位張，由舊到新
function merge(instRows, priceRows) {
  const byDate = new Map();
  for (const r of priceRows) {
    byDate.set(r.date, { date: r.date, foreign: 0, trust: 0, close: r.close, vol: r.Trading_Volume / 1000 });
  }
  for (const r of instRows) {
    const d = byDate.get(r.date);
    if (!d) continue;
    const net = (r.buy - r.sell) / 1000;
    if (r.name === 'Foreign_Investor') d.foreign += net;
    else if (r.name === 'Investment_Trust') d.trust += net;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

const startDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
const out = { updated: new Date().toISOString().slice(0, 10), asOf: null, unit: '張', stocks: {} };
const failed = [];

for (const s of TRACKED) {
  const inst  = await get('TaiwanStockInstitutionalInvestorsBuySell', s.id, startDate);
  await sleep(GAP_MS);
  const price = await get('TaiwanStockPrice', s.id, startDate);
  await sleep(GAP_MS);

  if (!price || price.length === 0) { failed.push(s.id); console.log(`✗ ${s.id} ${s.name} 無價格資料`); continue; }

  const rows = merge(inst || [], price);
  const last20 = rows.slice(-20);
  const last5  = rows.slice(-5);
  const avgVol20 = last20.length ? sum(last20, 'vol') / last20.length : 0;

  // 近 20 個交易日報酬率（不足 20 日則用現有最早一筆）
  const base20 = rows.length > 20 ? rows[rows.length - 21].close : rows[0].close;
  const last   = rows[rows.length - 1];

  out.stocks[s.id] = {
    close:    last.close,
    date:     last.date,
    avgVol20: round(avgVol20, 1),
    f5:  round(sum(last5,  'foreign'), 1),
    f20: round(sum(last20, 'foreign'), 1),
    t5:  round(sum(last5,  'trust'), 1),
    t20: round(sum(last20, 'trust'), 1),
    // 近 5 日「外資＋投信合計淨買超」的天數，用來看買盤是否連續
    buyDays5: last5.filter(r => (r.foreign + r.trust) > 0).length,
    ret20: base20 ? round((last.close / base20 - 1) * 100, 2) : null
  };
  if (!out.asOf || last.date > out.asOf) out.asOf = last.date;
  console.log(`✓ ${s.id} ${s.name} 外資20日 ${out.stocks[s.id].f20} 張 / 投信 ${out.stocks[s.id].t20} 張`);
}

writeFileSync(join(root, 'chips.json'), JSON.stringify(out, null, 1), 'utf8');
console.log(`chips.json 已更新：${Object.keys(out.stocks).length} 檔，資料日 ${out.asOf}` +
            (failed.length ? `（失敗 ${failed.length} 檔：${failed.join('、')}）` : ''));
