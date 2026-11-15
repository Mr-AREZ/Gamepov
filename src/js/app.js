// Site-wide behaviour: language switch, navigation, search, live status, auth link.
import { cfg, db, link, getLang, setLangStored, isRtl, t } from './lib/ctx.js';
import { DICT } from './lib/i18n.js';
import { formatDate } from './lib/util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- language --------------------------------------------------
function fmtTime(node, lang) {
  const iso = node.getAttribute('datetime');
  if (!iso) return;
  const fmt = node.dataset.fmt;
  if (fmt === 'datetime') {
    // Show schedule times in the viewer's own time zone.
    const locale = lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US';
    try {
      node.textContent = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch { /* keep server text */ }
  } else {
    node.textContent = formatDate(iso, lang);
  }
}

export function applyLang(lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = isRtl(lang) ? 'rtl' : 'ltr';
  const dict = DICT[lang] || DICT.en;
  for (const n of $$('[data-i18n]')) {
    const key = n.dataset.i18n;
    let s = dict[key] ?? DICT.en[key] ?? key;
    if (n.dataset.vars) {
      try { for (const [k, v] of Object.entries(JSON.parse(n.dataset.vars))) s = s.replace(`{${k}}`, v); } catch { /* ignore */ }
    }
    n.textContent = s;
  }
  for (const n of $$('[data-i18n-ph]')) n.placeholder = dict[n.dataset.i18nPh] ?? n.placeholder;
  for (const n of $$('[data-i18n-aria]')) n.setAttribute('aria-label', dict[n.dataset.i18nAria] ?? '');
  for (const n of $$('time[data-fmt]')) fmtTime(n, lang);
  for (const n of $$('[data-lang-opt]')) n.classList.toggle('is-active', n.dataset.langOpt === lang);
  const tz = $('[data-tz]');
  if (tz) tz.textContent = `(${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  document.dispatchEvent(new CustomEvent('gamepov:lang', { detail: lang }));
}

function initLang() {
  const lang = getLang();
  if (lang !== document.body.dataset.defaultLang) applyLang(lang);
  else {
    for (const n of $$('[data-lang-opt]')) n.classList.toggle('is-active', n.dataset.langOpt === lang);
    for (const n of $$('time[data-fmt="datetime"]')) fmtTime(n, lang);
    const tz = $('[data-tz]');
    if (tz) tz.textContent = `(${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  }
  $('[data-lang-toggle]')?.addEventListener('click', () => {
    const next = getLang() === 'en' ? 'fa' : 'en';
    setLangStored(next);
    applyLang(next);
  });
}

// ---------- navigation ---------------------------------------------------
function initNav() {
  const btn = $('[data-nav-toggle]');
  const header = $('.site-header');
  btn?.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

// ---------- search ---------------------------------------------------------
function initSearch() {
  const wrap = $('[data-search]');
  if (!wrap) return;
  const input = $('[data-search-input]', wrap);
  const box = $('[data-search-results]', wrap);
  let index = null;
  let loading = null;
  const load = () => (loading ||= (window.GAMEPOV_SEARCH ? Promise.resolve(window.GAMEPOV_SEARCH) : fetch(link('search.json')).then((r) => r.json())).then((j) => (index = j)).catch(() => (index = [])));
  const close = () => { box.hidden = true; box.replaceChildren(); };
  const render = (q) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return close();
    const hits = (index || []).filter((e) => (e.t + ' ' + e.g).toLowerCase().includes(needle)).slice(0, 8);
    box.replaceChildren();
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = t('search.none');
      box.append(p);
    }
    for (const h of hits) {
      const a = document.createElement('a');
      a.href = link(h.u);
      const s = document.createElement('strong');
      s.textContent = h.t;
      const m = document.createElement('small');
      m.textContent = h.k === 'game' ? '🎮' : h.g || h.k;
      a.append(s, m);
      box.append(a);
    }
    box.hidden = false;
  };
  input.addEventListener('focus', load);
  input.addEventListener('input', async () => { await load(); render(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); }
    if (e.key === 'Enter') {
      const first = $('a', box);
      if (first) location.href = first.href;
      else if (input.value.trim()) location.href = link(`streams/?q=${encodeURIComponent(input.value.trim())}`);
    }
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
}

// ---------- live status ------------------------------------------------------
async function initLive() {
  let live = cfg.live || {};
  if (db.configured) {
    try {
      const rows = await db.select('settings', { filters: { key: 'eq.live' } });
      if (rows?.[0]?.value) live = rows[0].value;
    } catch { /* fall back to baked value */ }
  }
  if (!live.is_live) return;
  const pill = $('#live-pill');
  if (pill) { pill.hidden = false; if (live.url) { pill.href = live.url; pill.target = '_blank'; pill.rel = 'noopener noreferrer'; } }
  const banner = $('#live-banner');
  if (banner) {
    banner.hidden = false;
    if (live.url) { banner.href = live.url; banner.target = '_blank'; banner.rel = 'noopener noreferrer'; }
    const title = $('[data-live-title]', banner);
    if (title) title.textContent = [live.title, live.game].filter(Boolean).join(' · ');
  }
}

// ---------- auth link in header ------------------------------------------------
function initAuthLink() {
  const a = $('[data-auth-link]');
  if (!a || !db.user) return;
  const name = db.user.user_metadata?.display_name || db.user.email?.split('@')[0] || '';
  a.removeAttribute('data-i18n');
  a.textContent = name;
}

// ---------- page modules ----------------------------------------------------------
const PAGES = ['home', 'archive', 'stream', 'schedule', 'contact', 'account', 'admin'];

async function boot() {
  initLang();
  initNav();
  initSearch();
  initAuthLink();
  initLive();
  const page = document.body.dataset.page;
  if (PAGES.includes(page)) {
    try {
      const mod = await import(`./pages/${page}.js`);
      await mod.default?.();
    } catch (e) {
      console.error(`Failed to start page module "${page}"`, e);
    }
  }
}

boot();
