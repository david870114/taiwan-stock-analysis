// my-stocks-api — 「我的股票」後端
// 功能：帳號註冊/登入（PBKDF2 雜湊）、資產組合儲存（KV）、
//       交易時段排程檢查到價（便宜/合理/昂貴價 X% 內、自訂目標價）並以 LINE Messaging API 推播
//
// KV key 結構：
//   user:{account}            → { salt, hash, createdAt }
//   session:{token}           → account（TTL 30 天）
//   portfolio:{account}       → { holdings, watchlist, alerts, updatedAt }
//   alertstate:{account}:{id} → 上次通知的狀態（expensive / nearfair / none）

const PRICE_API = 'https://taiwan-stock-price.david870114.workers.dev/?id=';
const VALUATIONS_URL = 'https://david870114.github.io/taiwan-stock-analysis/valuations.json';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const PBKDF2_ITER = 100000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ── 密碼雜湊 ─────────────────────────────────────────────
function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key, 256
  );
  return { salt: toHex(salt.buffer), hash: toHex(bits) };
}

function normAccount(account) {
  return String(account || '').trim().toLowerCase();
}

async function getSessionAccount(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return env.KV.get('session:' + token);
}

// ── LINE 推播 ────────────────────────────────────────────
async function linePush(env, lineUserId, text) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  return res.ok;
}

// ── API 路由 ─────────────────────────────────────────────
async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const path = url.pathname;

  // LINE webhook：使用者傳訊息給官方帳號 → 回覆他的 userId，方便貼到設定頁
  if (path === '/line-webhook' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const events = (body && body.events) || [];
    for (const ev of events) {
      if (ev.type === 'message' && ev.replyToken && ev.source && ev.source.userId) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            replyToken: ev.replyToken,
            messages: [{
              type: 'text',
              text: '✅ 已連結台股追蹤通知！\n\n你的 LINE User ID：\n' + ev.source.userId +
                    '\n\n請複製上面這串 ID，貼到「我的股票」頁面的通知設定中。',
            }],
          }),
        });
      }
    }
    return json({ ok: true });
  }

  if (path === '/api/register' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const account = normAccount(body.account);
    const password = String(body.password || '');
    if (!account || account.length < 3) return json({ error: '請輸入有效的 email 或 LINE ID' }, 400);
    if (password.length < 4) return json({ error: '密碼至少 4 個字元' }, 400);
    if (await env.KV.get('user:' + account)) return json({ error: '此帳號已註冊，請直接登入' }, 409);
    const { salt, hash } = await hashPassword(password);
    await env.KV.put('user:' + account, JSON.stringify({ salt, hash, createdAt: Date.now() }));
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    await env.KV.put('session:' + token, account, { expirationTtl: SESSION_TTL });
    return json({ token, account });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const account = normAccount(body.account);
    const userRaw = await env.KV.get('user:' + account);
    if (!userRaw) return json({ error: '帳號不存在，請先註冊' }, 404);
    const user = JSON.parse(userRaw);
    const { hash } = await hashPassword(String(body.password || ''), user.salt);
    if (hash !== user.hash) return json({ error: '密碼錯誤' }, 401);
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    await env.KV.put('session:' + token, account, { expirationTtl: SESSION_TTL });
    return json({ token, account });
  }

  // 以下皆需登入
  const account = await getSessionAccount(request, env);
  if (!account) return json({ error: '未登入或登入已過期' }, 401);

  if (path === '/api/portfolio' && request.method === 'GET') {
    const raw = await env.KV.get('portfolio:' + account);
    return json(raw ? JSON.parse(raw) : { holdings: [], watchlist: [], realized: [], allocTarget: null, alerts: { enabled: false, lineUserId: '', custom: {}, perStock: {} } });
  }

  if (path === '/api/portfolio' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.holdings) || !Array.isArray(body.watchlist)) {
      return json({ error: '資料格式錯誤' }, 400);
    }
    const portfolio = {
      holdings: body.holdings.slice(0, 100),
      watchlist: body.watchlist.slice(0, 100),
      realized: Array.isArray(body.realized) ? body.realized.slice(0, 500) : [],
      allocTarget: body.allocTarget || null,
      alerts: body.alerts || { enabled: false, lineUserId: '', custom: {}, perStock: {} },
      updatedAt: Date.now(),
    };
    await env.KV.put('portfolio:' + account, JSON.stringify(portfolio));
    return json({ ok: true, updatedAt: portfolio.updatedAt });
  }

  if (path === '/api/test-line' && request.method === 'POST') {
    const raw = await env.KV.get('portfolio:' + account);
    const p = raw ? JSON.parse(raw) : null;
    const lineUserId = p && p.alerts && p.alerts.lineUserId;
    if (!lineUserId) return json({ error: '尚未設定 LINE User ID，請先儲存' }, 400);
    const ok = await linePush(env, lineUserId, '📈 測試通知成功！\n台股到價提醒已就緒，之後股價觸及你設定的提醒條件（便宜/合理/昂貴價 X% 內或自訂目標價）時會通知你。');
    return json(ok ? { ok: true } : { error: 'LINE 推播失敗，請確認 Channel Token 與 User ID' }, ok ? 200 : 500);
  }

  return json({ error: 'Not found' }, 404);
}

// ── 排程到價檢查 ─────────────────────────────────────────
// 提醒條件正規化：新格式 {on,pct} 直接用；舊布林 true/false 升級（exp→0%、fair→10%、cheap→0%）
function normAlertPart(v, defOn, defPct) {
  if (v && typeof v === 'object') {
    const p = parseFloat(v.pct);
    return { on: !!v.on, pct: Number.isFinite(p) && p >= 0 ? p : defPct };
  }
  if (v === true) return { on: true, pct: defPct };
  if (v === false) return { on: false, pct: defPct };
  return { on: defOn, pct: defPct };
}

async function checkAlerts(env) {
  // 1. 取估值表
  const valRes = await fetch(VALUATIONS_URL, { cf: { cacheTtl: 300 } });
  if (!valRes.ok) return;
  const valuations = {};
  for (const s of (await valRes.json()).stocks) valuations[s.id] = s;

  // 2. 列出所有使用者組合，收集開啟通知者的股票
  const list = await env.KV.list({ prefix: 'portfolio:' });
  const users = [];
  const stockIds = new Set();
  for (const key of list.keys) {
    const raw = await env.KV.get(key.name);
    if (!raw) continue;
    const p = JSON.parse(raw);
    if (!p.alerts || !p.alerts.enabled || !p.alerts.lineUserId) continue;
    const acct = key.name.slice('portfolio:'.length);
    const ids = [...new Set([...(p.holdings || []).map(h => h.id), ...(p.watchlist || [])])];
    users.push({ acct, p, ids });
    ids.forEach(id => stockIds.add(id));
  }
  if (!users.length) return;

  // 3. 逐檔抓即時股價（股價 Worker 有限流：必須逐一發送並間隔 ≥250ms）
  const prices = {};
  for (const id of stockIds) {
    try {
      const res = await fetch(PRICE_API + id, { cache: 'no-cache' });
      const data = JSON.parse(await res.text());
      const px = parseFloat(data.price);
      if (px > 0) prices[id] = px;
    } catch (e) { /* 單檔失敗跳過 */ }
    await new Promise(r => setTimeout(r, 300));
  }

  // 4. 依每檔的提醒設定判斷條件、去重（只在條件「新成立」時通知）、推播
  for (const { acct, p, ids } of users) {
    const msgs = [];
    const perStock = p.alerts.perStock || {};
    for (const id of ids) {
      const px = prices[id];
      if (!px) continue;
      const custom = (p.alerts.custom || {})[id] || {};
      const v = valuations[id] || {};
      const fair = custom.fair ?? v.fair;
      const expensive = custom.expensive ?? v.expensive;
      const cheap = custom.cheap ?? v.cheap;
      const name = v.name || (p.holdings.find(h => h.id === id) || {}).name || id;
      // 新格式 {cheap:{on,pct}, fair:{on,pct}, exp:{on,pct}}；舊布林格式自動升級
      // 預設（未設定過）：昂貴價 0% + 合理價 10% 內
      const raw = perStock[id];
      const cfg = {
        exp:   normAlertPart(raw && raw.exp,   !raw, 0),
        fair:  normAlertPart(raw && raw.fair,  !raw, 10),
        cheap: normAlertPart(raw && raw.cheap, false, 0),
        above: raw && raw.above != null ? raw.above : null,
        below: raw && raw.below != null ? raw.below : null,
      };
      const expThr   = expensive != null ? expensive * (1 - cfg.exp.pct / 100) : null;
      const fairThr  = fair != null ? fair * (1 + cfg.fair.pct / 100) : null;
      const cheapThr = cheap != null ? cheap * (1 + cfg.cheap.pct / 100) : null;

      // 目前成立的條件集合
      const active = [];
      if (cfg.exp.on && expThr != null && px >= expThr) active.push('exp');
      if (cfg.fair.on && fairThr != null && px <= fairThr) active.push('fair');
      if (cfg.cheap.on && cheapThr != null && px <= cheapThr) active.push('cheap');
      if (cfg.above != null && px >= cfg.above) active.push('above');
      if (cfg.below != null && px <= cfg.below) active.push('below');

      const stateKey = 'alertstate:' + acct + ':' + id;
      const prevRaw = await env.KV.get(stateKey);
      let prev = [];
      try { prev = JSON.parse(prevRaw) || []; } catch (e) {
        // 相容舊格式（單一字串）
        if (prevRaw === 'expensive') prev = ['exp'];
        else if (prevRaw === 'nearfair') prev = ['fair'];
      }

      const newly = active.filter(c => prev.indexOf(c) < 0);
      if (newly.length || active.length !== prev.length) {
        await env.KV.put(stateKey, JSON.stringify(active), { expirationTtl: 60 * 60 * 24 * 90 });
      }
      for (const c of newly) {
        if (c === 'exp')   msgs.push('🔴 ' + name + '（' + id + '）現價 ' + px + (cfg.exp.pct > 0
          ? ' 已進入昂貴價 ' + expensive + ' 的 ' + cfg.exp.pct + '% 範圍內（≥' + expThr.toFixed(1) + '），可考慮分批獲利了結。'
          : ' 已達昂貴價 ' + expensive + '，可考慮分批獲利了結。'));
        if (c === 'fair')  msgs.push('🟡 ' + name + '（' + id + '）現價 ' + px + (cfg.fair.pct > 0
          ? ' 已跌到合理價 ' + fair + ' 的 ' + cfg.fair.pct + '% 範圍內（≤' + fairThr.toFixed(1) + '），可留意買點。'
          : ' 已跌到合理價 ' + fair + '，可留意買點。'));
        if (c === 'cheap') msgs.push('🟢 ' + name + '（' + id + '）現價 ' + px + (cfg.cheap.pct > 0
          ? ' 已跌到便宜價 ' + cheap + ' 的 ' + cfg.cheap.pct + '% 範圍內（≤' + cheapThr.toFixed(1) + '），接近超值區。'
          : ' 已跌破便宜價 ' + cheap + '，進入超值區。'));
        if (c === 'above') msgs.push('📈 ' + name + '（' + id + '）現價 ' + px + ' 已漲到你設定的目標價 ' + cfg.above + ' 以上。');
        if (c === 'below') msgs.push('📉 ' + name + '（' + id + '）現價 ' + px + ' 已跌到你設定的目標價 ' + cfg.below + ' 以下。');
      }
    }
    if (msgs.length) {
      await linePush(env, p.alerts.lineUserId, '📊 台股到價提醒\n\n' + msgs.join('\n\n'));
    }
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return json({ error: 'Server error: ' + e.message }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlerts(env));
  },
};
