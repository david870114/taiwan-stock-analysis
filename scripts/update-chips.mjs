// 產生 chips.json — 首頁「近期操作排名」的資料來源（收盤價、漲幅、籌碼、財務品質）
// 資料：FinMind 公開 API（免 token）
//   TaiwanStockPrice                          → 收盤價、成交量
//   TaiwanStockInstitutionalInvestorsBuySell  → 外資 / 投信逐日買賣超（單位：股）
//   TaiwanStockDividendResult                 → 除權息前後參考價，用來還原歷史股價
//   TaiwanStockFinancialStatements            → 逐季 營收 / 毛利 / 淨利 / EPS
//   TaiwanStockMonthRevenue                   → 月營收
// 執行：node scripts/update-chips.mjs          （財報與月營收超過 6 天才重抓）
//      node scripts/update-chips.mjs --full   （全部重抓）
// 時機：每個交易日收盤後（GitHub Actions update-institutional.yml 內自動執行）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(root, 'chips.json');
const API  = 'https://api.finmindtrade.com/api/v4/data';
const GAP_MS = 200;              // FinMind 約 300 次/小時，逐檔間隔避免瞬間打滿
const LOOKBACK_DAYS = 420;       // 約 420 個日曆日 ≈ 280 個交易日，夠算一年報酬
const FUND_MAX_AGE_DAYS = 6;     // 財報／月營收是季月更新，超過這天數才重抓
const FULL = process.argv.includes('--full');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/var TRACKED = \[[\s\S]*?\n\];/);
if (!m) { console.error('找不到 TRACKED 陣列'); process.exit(1); }
const TRACKED = new Function(m[0] + '; return TRACKED;')();

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { stocks: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (v, n = 2) => (v === null || v === undefined || !isFinite(v)) ? null : Math.round(v * 10 ** n) / 10 ** n;
const today = new Date().toISOString().slice(0, 10);
const daysAgo = iso => (Date.now() - new Date(iso).getTime()) / 86400000;

async function get(dataset, id, startDate) {
  const url = API + '?dataset=' + dataset + '&data_id=' + id + '&start_date=' + startDate;
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

/* ── 逐日彙總：回傳 [{ date, foreign, trust, close, adj, vol }]，單位張，由舊到新 ──
   adj = 除權息還原後的收盤價：把每次除權息事件「之前」的收盤乘上 after/before，
   多次事件連乘。不還原的話 6669（2026-09-02 除權 7800→2615）會算出 −66% 的假跌幅。 */
function merge(instRows, priceRows, divRows) {
  const byDate = new Map();
  for (const r of priceRows) {
    byDate.set(r.date, { date: r.date, foreign: 0, trust: 0, close: r.close, adj: r.close, vol: r.Trading_Volume / 1000 });
  }
  for (const r of instRows) {
    const d = byDate.get(r.date);
    if (!d) continue;
    const net = (r.buy - r.sell) / 1000;
    if (r.name === 'Foreign_Investor') d.foreign += net;
    else if (r.name === 'Investment_Trust') d.trust += net;
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const events = (divRows || [])
    .filter(e => e.before_price > 0 && e.after_price > 0)
    .map(e => ({ date: e.date, factor: e.after_price / e.before_price }))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const ev of events) {
    for (const r of rows) {
      if (r.date < ev.date) r.adj *= ev.factor;
    }
  }
  return rows;
}

const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);

// 報酬率（還原後）：往回 n 個交易日
function ret(rows, n) {
  if (rows.length <= n) return null;
  const a = rows[rows.length - 1 - n].adj, b = rows[rows.length - 1].adj;
  return (a > 0) ? round((b / a - 1) * 100) : null;
}

/* ── 財務品質：毛利率／淨利率與去年同季比（避開淡旺季）、TTM EPS 年增率、近三月營收年增率 ── */
function buildFund(finRows, revRows) {
  if (!finRows || !finRows.length) return null;

  const q = new Map();
  for (const r of finRows) {
    if (!q.has(r.date)) q.set(r.date, {});
    q.get(r.date)[r.type] = r.value;
  }
  const quarters = [...q.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, v }));
  if (quarters.length < 5) return null;

  const last = quarters[quarters.length - 1];
  const yearAgo = quarters[quarters.length - 5];           // 去年同季
  // 淨利率優先用歸屬母公司業主淨利（控股公司如 4958、5483 用合併淨利會灌水）
  const margin = (x, kind) => {
    const rev = x.v.Revenue;
    const net = kind === 'np'
      ? (x.v.EquityAttributableToOwnersOfParent !== undefined ? x.v.EquityAttributableToOwnersOfParent : x.v.IncomeAfterTaxes)
      : x.v.GrossProfit;
    return (rev > 0 && net !== undefined && net !== null) ? net / rev * 100 : null;
  };
  const gmLatest  = margin(last, 'gm'),  gmPrev  = margin(yearAgo, 'gm');
  const npmLatest = margin(last, 'np'),  npmPrev = margin(yearAgo, 'np');

  const eps = quarters.map(x => x.v.EPS).filter(v => typeof v === 'number');
  let epsTtm = null, epsYoY = null;
  if (eps.length >= 4) {
    epsTtm = eps.slice(-4).reduce((s, v) => s + v, 0);
    if (eps.length >= 8) {
      const prevTtm = eps.slice(-8, -4).reduce((s, v) => s + v, 0);
      if (prevTtm > 0) epsYoY = (epsTtm - prevTtm) / prevTtm * 100;
    }
  }

  // 近三月累計營收年增率
  let rev3mYoY = null;
  if (revRows && revRows.length >= 15) {
    const rs = revRows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const cur = rs.slice(-3).reduce((s, r) => s + r.revenue, 0);
    const ago = rs.slice(-15, -12).reduce((s, r) => s + r.revenue, 0);
    if (ago > 0) rev3mYoY = (cur - ago) / ago * 100;
  }

  return {
    quarter:   last.date,
    epsTtm:    round(epsTtm),
    epsYoY:    round(epsYoY, 1),
    gmLatest:  round(gmLatest, 1),
    gmYoYpp:   (gmLatest !== null && gmPrev !== null) ? round(gmLatest - gmPrev, 1) : null,
    npmLatest: round(npmLatest, 1),
    npmYoYpp:  (npmLatest !== null && npmPrev !== null) ? round(npmLatest - npmPrev, 1) : null,
    rev3mYoY:  round(rev3mYoY, 1),
    revMonth:  (revRows && revRows.length) ? revRows[revRows.length - 1].date : null
  };
}

const startDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
const finStart  = new Date(Date.now() - 1100 * 86400000).toISOString().slice(0, 10);   // 約三年，湊得到 8 季
const out = { updated: today, asOf: null, unit: '張', stocks: {} };
const failed = [];

for (const s of TRACKED) {
  const inst = await get('TaiwanStockInstitutionalInvestorsBuySell', s.id, startDate);
  await sleep(GAP_MS);
  const price = await get('TaiwanStockPrice', s.id, startDate);
  await sleep(GAP_MS);
  const divs = await get('TaiwanStockDividendResult', s.id, startDate);
  await sleep(GAP_MS);

  // 單檔抓失敗（多半是被 FinMind 限流）就沿用上一輪的值，不要讓它整檔從排名裡消失
  const prevRow = prev.stocks && prev.stocks[s.id];
  if (!price || price.length === 0) {
    failed.push(s.id);
    if (prevRow) { out.stocks[s.id] = prevRow; console.log('⚠ ' + s.id + ' ' + s.name + ' 抓不到價格，沿用 ' + prevRow.date + ' 的資料'); }
    else { console.log('✗ ' + s.id + ' ' + s.name + ' 無價格資料且無舊值'); }
    continue;
  }

  const rows = merge(inst || [], price, divs);
  const last20 = rows.slice(-20);
  const last5  = rows.slice(-5);
  const avgVol20 = last20.length ? sum(last20, 'vol') / last20.length : 0;
  const last = rows[rows.length - 1];

  // 財報與月營收是季／月更新，沿用舊值直到超過 FUND_MAX_AGE_DAYS
  const old = prevRow;
  const fundFresh = !FULL && old && old.fundUpdated && daysAgo(old.fundUpdated) < FUND_MAX_AGE_DAYS;
  let fund, fundUpdated;
  if (fundFresh) {
    fund = old.fund; fundUpdated = old.fundUpdated;
  } else {
    const fin = await get('TaiwanStockFinancialStatements', s.id, finStart);
    await sleep(GAP_MS);
    const rev = await get('TaiwanStockMonthRevenue', s.id, finStart);
    await sleep(GAP_MS);
    fund = buildFund(fin, rev);          // ETF 查不到財報 → null
    fundUpdated = today;
  }

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
    ret5:   ret(rows, 5),
    ret20:  ret(rows, 20),
    ret60:  ret(rows, 60),
    ret240: ret(rows, 240),
    fund: fund,
    fundUpdated: fundUpdated
  };
  if (!out.asOf || last.date > out.asOf) out.asOf = last.date;
  const f = out.stocks[s.id];
  console.log('✓ ' + s.id + ' ' + s.name + ' 收 ' + f.close + '　一年 ' + (f.ret240 === null ? '—' : f.ret240 + '%') +
              '　外資20日 ' + f.f20 + ' 張' +
              (f.fund ? '　' + f.fund.quarter + ' 毛利 ' + f.fund.gmLatest + '% (' + (f.fund.gmYoYpp >= 0 ? '+' : '') + f.fund.gmYoYpp + 'pp)' : '　無財報(ETF)'));
}

writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
console.log('chips.json 已更新：' + Object.keys(out.stocks).length + ' 檔，資料日 ' + out.asOf +
            (failed.length ? '（失敗 ' + failed.length + ' 檔：' + failed.join('、') + '）' : ''));
