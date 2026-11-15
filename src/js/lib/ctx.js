// Shared browser context: config, backend client, language helpers.
import { createClient } from './supa.js';
import { tr, LANGS, RTL } from './i18n.js';

export const cfg = window.GAMEPOV || {};
export const db = createClient({ url: cfg.supabaseUrl, anonKey: cfg.anonKey });
export const root = document.body.dataset.root || './';

/** Build a URL to another page of the site (adds index.html when the site is opened from disk). */
export function link(p) {
  const i = p.indexOf('?');
  const a = i < 0 ? p : p.slice(0, i);
  const q = i < 0 ? '' : p.slice(i);
  return root + a + (cfg.local && (a === '' || a.endsWith('/')) ? 'index.html' : '') + q;
}

const LANG_KEY = 'gamepov.lang';

export function getLang() {
  let l = null;
  try { l = localStorage.getItem(LANG_KEY); } catch { /* storage blocked */ }
  return LANGS.includes(l) ? l : cfg.defaultLang || 'en';
}

export function setLangStored(l) {
  try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ }
}

export const isRtl = (l) => RTL.includes(l);
export const t = (key, vars) => tr(getLang(), key, vars);

export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

export const onLang = (fn) => document.addEventListener('gamepov:lang', () => fn(getLang()));
