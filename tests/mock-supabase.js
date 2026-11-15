// In-memory fake of the Supabase REST/Auth/Storage endpoints Gamepov uses. For tests & local demos only.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadDemo } from '../scripts/lib/demo.js';

export function startMock({ port = 54321 } = {}) {
  const demo = loadDemo();
  const db = {
    games: demo.games, streams: demo.streams, schedule: demo.schedule, posts: demo.posts,
    achievements: demo.achievements, sponsors: demo.sponsors, comments: demo.comments,
    messages: [], profiles: [],
    settings: Object.entries(demo.settings).map(([key, value]) => ({ key, value }))
  };
  const users = new Map(); // id -> {id,email,password,user_metadata}
  const tokens = new Map(); // access token -> user id
  const refresh = new Map();
  const files = new Map();
  const uid = () => crypto.randomUUID();

  const sessionFor = (u) => {
    const access = 'at_' + uid();
    const ref = 'rt_' + uid();
    tokens.set(access, u.id);
    refresh.set(ref, u.id);
    return { access_token: access, refresh_token: ref, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: u.id, email: u.email, user_metadata: u.user_metadata } };
  };
  const me = (req) => {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const id = tokens.get(t);
    return id ? users.get(id) : null;
  };
  const isAdmin = (u) => !!u && db.profiles.find((p) => p.id === u.id)?.role === 'admin';

  const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(body === undefined ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const matches = (row, url) => {
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const m = /^(eq|gte|lte|neq)\.(.*)$/.exec(v);
      if (!m) continue;
      const a = row[k];
      const b = m[2];
      if (m[1] === 'eq' && String(a) !== b) return false;
      if (m[1] === 'neq' && String(a) === b) return false;
      if (m[1] === 'gte' && !(a >= b)) return false;
      if (m[1] === 'lte' && !(a <= b)) return false;
    }
    return true;
  };

  const server = http.createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-upsert, x-client-info', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
    if (req.method === 'OPTIONS') return send(res, 204, undefined, cors);
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const out = (s, b, h) => send(res, s, b, { ...cors, ...h });
    try {
      // ---------- auth ----------
      if (p === '/auth/v1/signup' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        if ([...users.values()].some((u) => u.email === b.email)) return out(422, { msg: 'User already registered' });
        if (!b.password || b.password.length < 6) return out(422, { msg: 'Password should be at least 6 characters' });
        const u = { id: uid(), email: b.email, password: b.password, user_metadata: b.data || {} };
        users.set(u.id, u);
        const first = !db.profiles.some((x) => x.role === 'admin');
        db.profiles.push({ id: u.id, display_name: u.user_metadata.display_name || b.email.split('@')[0], role: first ? 'admin' : 'viewer' });
        return out(200, sessionFor(u));
      }
      if (p === '/auth/v1/token' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        const gt = url.searchParams.get('grant_type');
        if (gt === 'password') {
          const u = [...users.values()].find((x) => x.email === b.email && x.password === b.password);
          return u ? out(200, sessionFor(u)) : out(400, { error_description: 'Invalid login credentials' });
        }
        if (gt === 'refresh_token') {
          const id = refresh.get(b.refresh_token);
          return id ? out(200, sessionFor(users.get(id))) : out(400, { error_description: 'Invalid refresh token' });
        }
      }
      if (p === '/auth/v1/logout') { tokens.delete((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); return out(204); }

      // ---------- storage ----------
      let m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(p);
      if (m && req.method === 'GET') {
        const f = files.get(`${m[1]}/${decodeURIComponent(m[2])}`);
        return f ? out(200, f.data, { 'Content-Type': f.type }) : out(404, { message: 'not found' });
      }
      m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p);
      if (m && req.method === 'POST') {
        if (!isAdmin(me(req))) return out(403, { message: 'new row violates row-level security policy' });
        files.set(`${m[1]}/${decodeURIComponent(m[2])}`, { data: await readBody(req), type: req.headers['content-type'] || 'application/octet-stream' });
        return out(200, { Key: `${m[1]}/${m[2]}` });
      }

      // ---------- rest ----------
      m = /^\/rest\/v1\/([a-z_]+)$/.exec(p);
      if (m) {
        const table = m[1];
        if (!db[table]) return out(404, { message: 'relation does not exist' });
        const user = me(req);
        const admin = isAdmin(user);
        const rows = db[table];
        if (req.method === 'GET') {
          if (table === 'messages' && !admin) return out(200, []);
          if (table === 'profiles' && !user) return out(200, []);
          let r = rows.filter((x) => matches(x, url));
          if ((table === 'streams' || table === 'posts') && !admin) r = r.filter((x) => x.is_published);
          if (table === 'profiles' && !admin) r = r.filter((x) => x.id === user.id);
          const ord = url.searchParams.get('order');
          if (ord) { const [col, dir] = ord.split('.'); r = [...r].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
          const lim = Number(url.searchParams.get('limit'));
          if (lim) r = r.slice(0, lim);
          return out(200, r);
        }
        const body = JSON.parse((await readBody(req)).toString() || 'null');
        const minimal = /return=minimal/.test(req.headers.prefer || '');
        const respond = (status, rowsOut) => (minimal ? out(status) : out(status, rowsOut));
        if (req.method === 'POST') {
          const list = Array.isArray(body) ? body : [body];
          const merge = /merge-duplicates/.test(req.headers.prefer || '');
          const allowed =
            table === 'messages' ? true :
            table === 'comments' ? !!user && list.every((x) => x.user_id === user.id) :
            admin;
          if (!allowed) return out(table === 'comments' || table === 'messages' ? 403 : 403, { message: 'new row violates row-level security policy for table "' + table + '"' });
          const created = [];
          for (const item of list) {
            const key = url.searchParams.get('on_conflict');
            const existing = merge && key ? rows.find((x) => x[key] === item[key]) : null;
            if (existing) { Object.assign(existing, item); created.push(existing); continue; }
            if (item.slug && rows.some((x) => x.slug === item.slug)) return out(409, { message: `duplicate key value violates unique constraint "${table}_slug_key"` });
            const row = { id: uid(), created_at: new Date().toISOString(), ...item };
            rows.push(row);
            created.push(row);
          }
          return respond(201, created);
        }
        if (req.method === 'PATCH' || req.method === 'DELETE') {
          const target = rows.filter((x) => matches(x, url));
          const ok = admin || (table === 'comments' && req.method === 'DELETE' && target.every((x) => user && x.user_id === user.id));
          if (!ok) return out(403, { message: 'permission denied' });
          if (req.method === 'PATCH') {
            for (const t of target) {
              if (body.slug && rows.some((x) => x !== t && x.slug === body.slug)) return out(409, { message: 'duplicate key value violates unique constraint' });
              Object.assign(t, body);
            }
          } else for (const t of target) rows.splice(rows.indexOf(t), 1);
          return respond(200, target);
        }
      }
      out(404, { message: 'not found: ' + p });
    } catch (e) {
      out(500, { message: String(e.stack || e) });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, db, users, files, port, close: () => server.close() })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 54321);
  startMock({ port }).then(() => console.log(`Mock Supabase on http://localhost:${port}  (anon key: any non-empty string)`));
}
