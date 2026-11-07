// 估值帶健檢：對指定個股算出「近三年逐月 PER 區間」與「正常化 EPS」，
// 供人工判斷估值帶該維持、調倍數、還是改用正常化 EPS 重設。
// 只印結果，不會寫進 index.html / valuations.json（估值帶一律人工決定）。
//
// 用法：node scripts/band-review.mjs 8046 3037 2344 ...
//      node scripts/band-review.mjs --over     只看現價高於昂貴價的
//      node scripts/band-review.mjs --under    只看現價低於便宜價的
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API  = 'https://api.finmindtrade.com/api/v4/data';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VALS  = JSON.parse(readFileSync(join(root, 'valuations.json'), 'utf8')).stocks;
const CHIPS = JSON.parse(readFileSync(join(root, 'chips.json'), 'utf8')).stocks;
const html  = readFileSync(join(root, 'index.html'), 'utf8');
const TRACKED = new Function(html.match(/var TRACKED = \[[\s\S]*?\n\];/)[0] + '; return TRACKED;')();
const tmap = {}; TRACKED.forEach(s => { tmap[s.id] = s; });

let args = process.argv.slice(2);
let ids;
if (args.includes('--over')) {
  ids = VALS.filter(s => { const c = CHIPS[s.id]; return c && c.close && s.expensive && c.close >= s.expensive; }).map(s => s.id);
} else if (args.includes('--under')) {
  ids = VALS.filter(s => { const c = CHIPS[s.id]; return c && c.close && s.cheap && c.close <= s.cheap; }).map(s => s.id);
} else {
  ids = args.filter(a => !a.startsWith('--'));
}
if (!ids.length) { console.error('請指定代號，或用 --over / --under'); process.exit(1); }

async function get(dataset, id, startDate) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${API}?dataset=${dataset}&data_id=${id}&start_date=${startDate}`);
      if (r.status === 402 || r.status === 429) { await sleep(4000); continue; }
      const j = await r.json();
      if (j.status === 200) return j.data || [];
    } catch (e) {}
    await sleep(1200);
  }
  return null;
}

const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) * p)]; };
const r2 = v => Math.round(v * 100) / 100;

const priceStart = new Date(Date.now() - 1150 * 86400000).toISOString().slice(0, 10);  // 約 3 年多
const finStart   = new Date(Date.now() - 2300 * 86400000).toISOString().slice(0, 10);  // 約 6 年，夠取 5 個完整年度

for (const id of ids) {
  const v = VALS.find(s => s.id === id);
  if (!v) { console.log(`\n${id}：不在追蹤清單`); continue; }
  const px  = await get('TaiwanStockPrice', id, priceStart);
  await sleep(300);
  const fin = await get('TaiwanStockFinancialStatements', id, finStart);
  await sleep(300);
  const bs  = await get('TaiwanStockBalanceSheet', id, priceStart);
  await sleep(300);
  if (!px || !px.length || !fin || !fin.length) { console.log(`\n${id} ${v.name}：資料不足（ETF 或被限流）`); continue; }

  // 逐季 EPS
  const qmap = new Map();
  for (const r of fin) { if (!qmap.has(r.date)) qmap.set(r.date, {}); qmap.get(r.date)[r.type] = r.value; }
  const quarters = [...qmap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, o]) => ({ date, eps: o.EPS, net: o.EquityAttributableToOwnersOfParent ?? o.IncomeAfterTaxes }));

  // 每月最後交易日收盤
  const byMonth = new Map();
  for (const r of px) byMonth.set(r.date.slice(0, 7), r.close);
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // 當月可得的 TTM EPS（財報約季末後 45 天公告，這裡用「季末 + 2 個月」近似）
  function ttmAt(ym) {
    const avail = quarters.filter(q => {
      const d = new Date(q.date); d.setMonth(d.getMonth() + 2);
      return d.toISOString().slice(0, 7) <= ym;
    });
    if (avail.length < 4) return null;
    return avail.slice(-4).reduce((s, q) => s + (q.eps || 0), 0);
  }

  const perSeries = [];
  for (const [ym, close] of months.slice(-36)) {
    const t = ttmAt(ym);
    if (t && t > 0) perSeries.push({ ym, close, ttm: r2(t), per: r2(close / t) });
  }

  // 年度 EPS（正常化用）
  const byYear = {};
  for (const q of quarters) {
    const y = q.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + (q.eps || 0);
  }
  const fullYears = Object.entries(byYear).filter(([y, s]) => {
    return quarters.filter(q => q.date.startsWith(y)).length === 4;
  });

  const c = CHIPS[id] || {};
  const nowEps = c.fund ? c.fund.epsTtm : null;
  const t = tmap[id] || {};
  const pers = perSeries.map(x => x.per);

  console.log('\n══════ ' + id + ' ' + v.name + ' ══════');
  console.log('  現價 ' + c.close + '　現有帶 ' + v.cheap + ' / ' + v.fair + ' / ' + v.expensive +
              (t.fairPER ? '（原均倍 ' + t.fairPER + 'x，回推 EPS ' + r2(v.fair / t.fairPER) + '）' : ''));
  console.log('  最新 TTM EPS ' + nowEps + '（' + (c.fund ? c.fund.quarter : '—') + '）　隱含 PER ' +
              (nowEps > 0 ? r2(c.close / nowEps) : '—') + 'x');
  if (pers.length) {
    console.log('  近三年逐月 PER：低 ' + pct(pers, 0) + ' ／ P25 ' + pct(pers, 0.25) + ' ／ 中位 ' + pct(pers, 0.5) +
                ' ／ P75 ' + pct(pers, 0.75) + ' ／ 高 ' + pct(pers, 1) + '（' + pers.length + ' 個月）');
    const lo = pct(pers, 0.1), mid = pct(pers, 0.5), hi = pct(pers, 0.9);
    console.log('  用 P10/中位/P90 倍數 × 最新 TTM：' +
                (nowEps > 0 ? [lo, mid, hi].map(x => Math.round(x * nowEps)).join(' / ') : '—') +
                '　（倍數 ' + lo + '/' + mid + '/' + hi + 'x）');
  }
  console.log('  逐季 EPS（近 8 季）：' + quarters.slice(-8).map(q => q.date.slice(2, 7) + ' ' + q.eps).join('　'));
  console.log('  年度 EPS：' + fullYears.map(([y, s]) => y + ' ' + r2(s)).join('　'));

  // 股數（歸母淨利 ÷ EPS）：看有沒有現增、減資、股票股利造成的股本變動
  const shares = fullYears.map(([y]) => {
    const qs = quarters.filter(q => q.date.startsWith(y) && q.eps && q.net);
    if (!qs.length) return y + ' —';
    const n = qs.reduce((s, q) => s + q.net, 0), e = qs.reduce((s, q) => s + q.eps, 0);
    return y + ' ' + r2(n / e / 1e8) + '億股';
  });
  console.log('  推估股數：' + shares.join('　'));

  // 近三年月收盤分布（估值帶要對得上實際成交區間）
  const closes = months.slice(-36).map(([, c0]) => c0);
  console.log('  近三年月收盤：低 ' + pct(closes, 0) + ' ／ 中位 ' + pct(closes, 0.5) + ' ／ 高 ' + pct(closes, 1));

  const norm = fullYears.slice(-5);
  if (norm.length >= 3) {
    const avg = norm.reduce((s, [, x]) => s + x, 0) / norm.length;
    const med = pct(norm.map(([, x]) => x), 0.5);
    console.log('  正常化 EPS：近 ' + norm.length + ' 年平均 ' + r2(avg) + '　中位數 ' + r2(med) +
                '（股本有變動時需先還原）');
    // 循環股的 TTM PER 會與 EPS 反向，所以改用「正常化 EPS 回推的逐月 PER」取區間
    for (const [label, base] of [['平均', avg], ['中位', med]]) {
      if (base <= 0) continue;
      const np = closes.map(c0 => r2(c0 / base));
      console.log('    用正常化 EPS(' + label + ' ' + r2(base) + ') 回推逐月 PER：低 ' + pct(np, 0) +
                  ' ／ P25 ' + pct(np, 0.25) + ' ／ 中位 ' + pct(np, 0.5) + ' ／ P75 ' + pct(np, 0.75) +
                  ' ／ 高 ' + pct(np, 1) + '　→ 帶 ' +
                  [pct(np, 0.1), pct(np, 0.5), pct(np, 0.9)].map(x => Math.round(x * base)).join(' / '));
    }
  }

  /* P/B：記憶體這類循環股的 EPS 在谷底與高峰都失真，淨值相對穩定，
     用 P/B 區間定帶比用 EPS 可靠（買在 1x 以下、賣在歷史高檔） */
  if (bs && bs.length) {
    const eq = new Map();
    for (const r of bs) {
      if (r.type === 'EquityAttributableToOwnersOfParent') eq.set(r.date, r.value);
    }
    // 股數：用最近有 EPS 與歸母淨利的季度推估
    const qs = quarters.filter(q => q.eps && q.net).slice(-4);
    const shareCnt = qs.length ? qs.reduce((s, q) => s + q.net, 0) / qs.reduce((s, q) => s + q.eps, 0) : null;
    const eqDates = [...eq.keys()].sort();
    if (shareCnt > 0 && eqDates.length) {
      const bvpsNow = eq.get(eqDates[eqDates.length - 1]) / shareCnt;
      // 逐月取「當時已公告」的淨值（季末 + 2 個月），否則用今天的淨值回推過去會低估當年的 P/B
      const pb = [];
      for (const [ym, close] of months.slice(-36)) {
        const avail = eqDates.filter(d => { const x = new Date(d); x.setMonth(x.getMonth() + 2); return x.toISOString().slice(0, 7) <= ym; });
        if (!avail.length) continue;
        const bv = eq.get(avail[avail.length - 1]) / shareCnt;
        if (bv > 0) pb.push(r2(close / bv));
      }
      console.log('  BVPS（最新季，母公司權益 ÷ ' + r2(shareCnt / 1e8) + ' 億股）：' + r2(bvpsNow) +
                  '　現價 P/B ' + r2(c.close / bvpsNow) + 'x');
      if (pb.length) {
        console.log('    近三年逐月 P/B（用當時淨值）：低 ' + pct(pb, 0) + ' ／ P25 ' + pct(pb, 0.25) + ' ／ 中位 ' + pct(pb, 0.5) +
                    ' ／ P75 ' + pct(pb, 0.75) + ' ／ 高 ' + pct(pb, 1) + '（' + pb.length + ' 個月）');
        console.log('    用 P10/中位/P90 的 P/B × 最新 BVPS → 帶 ' +
                    [pct(pb, 0.1), pct(pb, 0.5), pct(pb, 0.9)].map(x => Math.round(x * bvpsNow)).join(' / '));
      }
    }
  }

  // 毛利率趨勢：判斷獲利回升是結構性還是一次性
  const gm = quarters.slice(-8).map(q => {
    const o = qmap.get(q.date);
    return (o.Revenue > 0 && o.GrossProfit != null) ? q.date.slice(2, 7) + ' ' + r2(o.GrossProfit / o.Revenue * 100) + '%' : null;
  }).filter(Boolean);
  if (gm.length) console.log('  毛利率（近 8 季）：' + gm.join('　'));
}
