// 籌碼面窗期檢定：用橫斷面 Spearman IC 檢查「外資／投信近 N 日買超」對未來報酬的鑑別力，
// 決定 home.html 排名的回看窗期與配分。結果只印在終端機，不寫進任何網頁檔案。
//
// 執行：node scripts/ic-test.mjs            （第一次會抓兩年 FinMind 資料，約 1~2 分鐘）
//      node scripts/ic-test.mjs --refresh   （強制重抓，覆蓋快取）
// 快取：scripts/.ic-cache.json（已在 .gitignore，不進版控）
//
// IC = 當下訊號的橫斷面名次 vs 之後報酬名次的 Spearman 相關係數，逐日算完取平均；
// t 值 = 平均 IC ÷ 標準差 × √樣本數，|t| > 2 才算有統計意義。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root  = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(root, 'scripts', '.ic-cache.json');
const API   = 'https://api.finmindtrade.com/api/v4/data';
const START = '2024-10-01';

const html = readFileSync(join(root, 'index.html'), 'utf8');
const TRACKED = new Function(html.match(/var TRACKED = \[[\s\S]*?\n\];/)[0] + '; return TRACKED;')();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(dataset, id) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${API}?dataset=${dataset}&data_id=${id}&start_date=${START}`);
      if (r.status === 402 || r.status === 429) { await sleep(5000); continue; }
      const j = await r.json();
      if (j.status === 200) return j.data || [];
    } catch (e) {}
    await sleep(1500);
  }
  return null;
}

async function fetchHistory() {
  const out = {};
  for (const s of TRACKED) {
    const inst = await get('TaiwanStockInstitutionalInvestorsBuySell', s.id);
    await sleep(250);
    const px = await get('TaiwanStockPrice', s.id);
    await sleep(250);
    if (!px || !px.length) { console.log('✗', s.id, s.name); continue; }

    const byDate = new Map();
    for (const r of px) byDate.set(r.date, { d: r.date, c: r.close, v: r.Trading_Volume / 1000, f: 0, t: 0 });
    for (const r of (inst || [])) {
      const row = byDate.get(r.date);
      if (!row) continue;
      const net = (r.buy - r.sell) / 1000;
      if (r.name === 'Foreign_Investor') row.f += net;
      else if (r.name === 'Investment_Trust') row.t += net;
    }
    out[s.id] = [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
    console.log('✓', s.id, s.name, out[s.id].length, '天');
  }
  writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  return out;
}

const H = (!existsSync(CACHE) || process.argv.includes('--refresh'))
  ? await fetchHistory()
  : JSON.parse(readFileSync(CACHE, 'utf8'));

const ids = Object.keys(H);
let dates = [];
for (const id of ids) if (H[id].length > dates.length) dates = H[id].map(r => r.d);
const idx = {};
for (const id of ids) { idx[id] = {}; H[id].forEach((r, i) => { idx[id][r.d] = i; }); }

function rank(a) {
  const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < o.length;) {
    let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[o[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return (dx && dy) ? num / Math.sqrt(dx * dy) : 0;
}

// 與 home.html 相同的標準化：近 N 日淨買 ÷ (20 日均量 × N)
function signal(rows, i, N, key) {
  if (i < Math.max(N, 20)) return null;
  let net = 0;
  for (let k = i - N + 1; k <= i; k++) net += key === 'ft' ? (rows[k].f + rows[k].t) : rows[k][key];
  let vol = 0;
  for (let k = i - 19; k <= i; k++) vol += rows[k].v;
  const avg = vol / 20;
  return avg > 0 ? net / (avg * N) : null;
}
function buyDays(rows, i, N) {
  if (i < Math.max(N, 20)) return null;
  let c = 0;
  for (let k = i - N + 1; k <= i; k++) if (rows[k].f + rows[k].t > 0) c++;
  return c / N;
}

function ic(sigFn, horizon, step = 5) {
  const out = [];
  for (let d = 60; d < dates.length - horizon; d += step) {
    const date = dates[d], xs = [], ys = [];
    for (const id of ids) {
      const rows = H[id], i = idx[id][date];
      if (i === undefined || i + horizon >= rows.length) continue;
      const s = sigFn(rows, i, id);
      if (s === null || !isFinite(s)) continue;
      xs.push(s); ys.push(rows[i + horizon].c / rows[i].c - 1);
    }
    if (xs.length >= 20) out.push(spearman(xs, ys));
  }
  const n = out.length, mean = out.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(out.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  return { mean, t: mean / sd * Math.sqrt(n), hit: out.filter(v => v > 0).length / n, n };
}

const fmt = o => `${(o.mean * 100).toFixed(2).padStart(6)}% ${o.t.toFixed(1).padStart(6)} ${(o.hit * 100).toFixed(0).padStart(4)}%`;

for (const horizon of [5, 20, 60]) {
  console.log(`\n═══ 預測未來 ${horizon} 個交易日報酬 ═══`);
  console.log('窗期   外資IC    t值   勝率 |  投信IC    t值   勝率 |  合計IC    t值   勝率');
  for (const N of [3, 5, 7, 10, 20, 40, 60]) {
    console.log(`${String(N).padStart(3)}日 ${fmt(ic((r, i) => signal(r, i, N, 'f'), horizon))} | ` +
                `${fmt(ic((r, i) => signal(r, i, N, 't'), horizon))} | ` +
                `${fmt(ic((r, i) => signal(r, i, N, 'ft'), horizon))}`);
  }
  const bd = ic((r, i) => buyDays(r, i, 5), horizon);
  console.log(`買超天數(5日) IC ${(bd.mean * 100).toFixed(2)}%  t=${bd.t.toFixed(1)}  勝率 ${(bd.hit * 100).toFixed(0)}%  樣本 ${bd.n}`);
}

// 對照組：估值位階（註：用現在的估值帶回頭套過去股價，含少量前視偏誤）
const band = {};
JSON.parse(readFileSync(join(root, 'valuations.json'), 'utf8')).stocks.forEach(s => { band[s.id] = s; });
for (const horizon of [20, 60]) {
  const r = ic((rows, i, id) => {
    const b = band[id];
    if (!b || !b.cheap || !b.expensive || b.expensive <= b.cheap) return null;
    return (b.expensive - rows[i].c) / (b.expensive - b.cheap);
  }, horizon);
  console.log(`\n估值位階預測 ${horizon} 日：IC ${(r.mean * 100).toFixed(2)}%  t=${r.t.toFixed(1)}  勝率 ${(r.hit * 100).toFixed(0)}%`);
}
