// Tiny dependency-free Supabase client (PostgREST + GoTrue + Storage over fetch).
// Works in the browser and in Node 18+. Only the features Gamepov needs.

const SESSION_KEY = 'gamepov.session';

export function createClient({ url, anonKey, storage }) {
  const base = String(url || '').replace(/\/+$/, '');
  const configured = !!(base && anonKey);
  const store =
    storage ||
    (typeof localStorage !== 'undefined'
      ? localStorage
      : { getItem: () => null, setItem() {}, removeItem() {} });

  let session = null;
  try { session = JSON.parse(store.getItem(SESSION_KEY) || 'null'); } catch { session = null; }

  const saveSession = (s) => {
    session = s;
    try {
      if (s) store.setItem(SESSION_KEY, JSON.stringify(s));
      else store.removeItem(SESSION_KEY);
    } catch { /* storage unavailable */ }
  };

  const normalizeSession = (j) => ({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: j.user
  });

  async function authFetch(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${base}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (!res.ok) throw new Error(json.msg || json.error_description || json.message || json.error || `Auth error ${res.status}`);
    return json;
  }

  async function getToken() {
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at - 30 < now && session.refresh_token) {
      try {
        const j = await authFetch('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
        saveSession(normalizeSession(j));
      } catch {
        saveSession(null);
        return null;
      }
    }
    return session?.access_token || null;
  }

  async function rest(table, { method = 'GET', filters = {}, select, order, limit, body, prefer, upsert } = {}) {
    if (!configured) throw new Error('Supabase is not configured');
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    for (const [k, v] of Object.entries(filters)) params.set(k, v);
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    if (upsert) params.set('on_conflict', upsert);
    const token = await getToken();
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${token || anonKey}`,
      'Content-Type': 'application/json'
    };
    const prefers = [];
    if (prefer) prefers.push(prefer);
    if (upsert) prefers.push('resolution=merge-duplicates');
    if (prefers.length) headers.Prefer = prefers.join(',');
    const qs = params.toString();
    const res = await fetch(`${base}/rest/v1/${table}${qs ? '?' + qs : ''}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) throw new Error((json && (json.message || json.error)) || `Request failed (${res.status})`);
    return json;
  }

  const eq = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `eq.${v}`]));

  return {
    configured,
    base,
    // ----- data -----
    select: (table, opts = {}) => rest(table, { select: '*', ...opts }),
    insert: (table, rows, { minimal = false } = {}) => rest(table, { method: 'POST', body: rows, prefer: minimal ? 'return=minimal' : 'return=representation' }),
    upsert: (table, rows, onConflict) => rest(table, { method: 'POST', body: rows, prefer: 'return=representation', upsert: onConflict }),
    update: (table, match, patch) => rest(table, { method: 'PATCH', filters: eq(match), body: patch, prefer: 'return=representation' }),
    remove: (table, match) => rest(table, { method: 'DELETE', filters: eq(match), prefer: 'return=representation' }),
    // ----- auth -----
    get session() { return session; },
    get user() { return session?.user || null; },
    async signUp(email, password, displayName) {
      const j = await authFetch('signup', { method: 'POST', body: { email, password, data: { display_name: displayName } } });
      if (j.access_token) { saveSession(normalizeSession(j)); return { session: session, needsConfirmation: false }; }
      return { session: null, needsConfirmation: true };
    },
    async signIn(email, password) {
      const j = await authFetch('token?grant_type=password', { method: 'POST', body: { email, password } });
      saveSession(normalizeSession(j));
      return session;
    },
    async signOut() {
      const token = session?.access_token;
      saveSession(null);
      if (token && configured) { try { await authFetch('logout', { method: 'POST', token }); } catch { /* ignore */ } }
    },
    async getProfile() {
      if (!session) return null;
      const rows = await rest('profiles', { filters: eq({ id: session.user.id }), select: '*' });
      return rows?.[0] || null;
    },
    // ----- storage -----
    publicUrl: (bucket, path) => `${base}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,
    /** Upload a File/Blob with progress (browser only — XHR). */
    async upload(bucket, path, file, onProgress) {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const target = `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
      if (typeof XMLHttpRequest === 'undefined') {
        const res = await fetch(target, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        return this.publicUrl(bucket, path);
      }
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', target);
        xhr.setRequestHeader('apikey', anonKey);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            let msg = `Upload failed (${xhr.status})`;
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* keep */ }
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
      return this.publicUrl(bucket, path);
    },
    async removeFile(bucket, path) {
      const token = await getToken();
      if (!token) return;
      await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { method: 'DELETE', headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    }
  };
}
