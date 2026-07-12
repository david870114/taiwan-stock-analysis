// 從 index.html 的 TRACKED 陣列匯出 valuations.json
// 用途：my-stocks.html（我的股票分頁）與 my-stocks-api Worker（LINE 到價通知）共用估值資料
// 執行：node scripts/export-valuations.mjs
// 時機：每次修改 index.html 的 TRACKED 陣列後執行一次
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const m = html.match(/var TRACKED = \[[\s\S]*?\n\];/);
if (!m) {
  console.error('找不到 TRACKED 陣列');
  process.exit(1);
}
const TRACKED = new Function(m[0] + '; return TRACKED;')();

const out = {
  updated: new Date().toISOString().slice(0, 10),
  stocks: TRACKED.map(s => ({
    id: s.id,
    name: s.name,
    tier: s.tier || null,
    cheap: s.cheapValue ?? null,
    fair: s.fairValue ?? null,
    expensive: s.expValue ?? null,
    annualDiv: s.annualDiv ?? null,
    url: s.url || (s.id + '_analysis.html')
  }))
};

writeFileSync(join(root, 'valuations.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('valuations.json 已更新：' + out.stocks.length + ' 檔');
