// Admin panel: login + generic CRUD for every content type, uploads and site settings.
import { cfg, db, el, link } from '../lib/ctx.js';
import { slugify, formatDuration, esc } from '../lib/util.js';

const KINDS = [['stream', 'Stream'], ['clip', 'Clip'], ['highlight', 'Highlight']];
const SOURCES = [['youtube', 'YouTube link'], ['twitch', 'Twitch link'], ['upload', 'Upload a video file']];

// ---------- entity definitions ----------------------------------------------------
const ENTITIES = {
  streams: {
    label: 'Streams & clips', table: 'streams', order: 'published_at.desc', slugFrom: 'title',
    columns: [['title', 'Title'], ['game_id', 'Game', 'game'], ['kind', 'Type'], ['source', 'Source'], ['published_at', 'Published', 'date'], ['is_published', 'Live', 'bool']],
    defaults: () => ({ kind: 'stream', source: 'youtube', is_published: true, published_at: new Date().toISOString() }),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'kind', label: 'Type', type: 'select', options: KINDS },
      { name: 'game_id', label: 'Game', type: 'select', from: 'games' },
      { name: 'source', label: 'Video source', type: 'select', options: SOURCES },
      { name: 'video_ref', label: 'Video link / ID', type: 'text', required: true, hint: 'YouTube or Twitch link (or ID). For uploads this is filled automatically.', upload: { bucket: 'videos', accept: 'video/*', showWhen: ['source', 'upload'], detectDuration: true, label: 'Choose video file' } },
      { name: 'thumbnail_url', label: 'Thumbnail URL', type: 'text', hint: 'Optional. YouTube thumbnails are used automatically.', upload: { bucket: 'images', accept: 'image/*', label: 'Upload thumbnail' } },
      { name: 'duration_seconds', label: 'Duration (h:mm:ss)', type: 'duration' },
      { name: 'published_at', label: 'Published at', type: 'datetime' },
      { name: 'description', label: 'Description', type: 'textarea', hint: 'Shown under the video and used for Google. Add chapters like “12:40 Boss fight”.' },
      { name: 'slug', label: 'URL slug', type: 'text', hint: 'Leave empty to generate it from the title.' },
      { name: 'is_published', label: 'Published (visible on the site)', type: 'checkbox' }
    ]
  },
  games: {
    label: 'Games', table: 'games', order: 'created_at.asc', slugFrom: 'title',
    columns: [['title', 'Title'], ['genre', 'Genre'], ['platform', 'Platform']],
    defaults: () => ({}),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'cover_url', label: 'Cover image URL', type: 'text', upload: { bucket: 'images', accept: 'image/*', label: 'Upload cover' } },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'genre', label: 'Genre', type: 'text' },
      { name: 'platform', label: 'Platform', type: 'text' },
      { name: 'tags', label: 'Tags (comma separated)', type: 'tags' },
      { name: 'slug', label: 'URL slug', type: 'text', hint: 'Leave empty to generate it from the title.' }
    ]
  },
  schedule: {
    label: 'Schedule', table: 'schedule', order: 'starts_at.asc',
    columns: [['title', 'Title'], ['game_id', 'Game', 'game'], ['starts_at', 'Starts', 'datetime']],
    defaults: () => ({ starts_at: new Date(Date.now() + 86400000).toISOString() }),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'game_id', label: 'Game', type: 'select', from: 'games' },
      { name: 'starts_at', label: 'Starts at (your local time)', type: 'datetime', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' }
    ]
  },
  posts: {
    label: 'Blog posts', table: 'posts', order: 'published_at.desc', slugFrom: 'title',
    columns: [['title', 'Title'], ['published_at', 'Published', 'date'], ['is_published', 'Live', 'bool']],
    defaults: () => ({ is_published: true, published_at: new Date().toISOString() }),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'excerpt', label: 'Short excerpt', type: 'textarea' },
      { name: 'body', label: 'Body', type: 'textarea', rows: 12, hint: 'Markdown: ## heading, - list, **bold**, *italic*, [text](https://link)' },
      { name: 'cover_url', label: 'Cover image URL', type: 'text', upload: { bucket: 'images', accept: 'image/*', label: 'Upload cover' } },
      { name: 'published_at', label: 'Published at', type: 'datetime' },
      { name: 'slug', label: 'URL slug', type: 'text' },
      { name: 'is_published', label: 'Published (visible on the site)', type: 'checkbox' }
    ]
  },
  achievements: {
    label: 'Achievements', table: 'achievements', order: 'achieved_at.desc',
    columns: [['icon', ''], ['title', 'Title'], ['achieved_at', 'Date']],
    defaults: () => ({ icon: '🏆' }),
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon (emoji)', type: 'text' },
      { name: 'achieved_at', label: 'Date', type: 'date' }
    ]
  },
  sponsors: {
    label: 'Sponsors', table: 'sponsors', order: 'sort_order.asc',
    columns: [['name', 'Name'], ['url', 'Link'], ['sort_order', 'Order']],
    defaults: () => ({ sort_order: 0 }),
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'url', label: 'Website', type: 'text' },
      { name: 'logo_url', label: 'Logo URL', type: 'text', upload: { bucket: 'images', accept: 'image/*', label: 'Upload logo' } },
      { name: 'sort_order', label: 'Order', type: 'number' }
    ]
  },
  comments: {
    label: 'Comments', table: 'comments', order: 'created_at.desc', readonly: true,
    columns: [['author_name', 'Author'], ['body', 'Comment', 'long'], ['stream_id', 'Video', 'stream'], ['created_at', 'Date', 'datetime']]
  },
  messages: {
    label: 'Messages', table: 'messages', order: 'created_at.desc', readonly: true,
    columns: [['name', 'From'], ['email', 'Email'], ['subject', 'Subject'], ['body', 'Message', 'long'], ['created_at', 'Date', 'datetime']]
  }
};

const SETTINGS_SECTIONS = [
  { key: 'profile', label: 'Profile', fields: [
    { name: 'name', label: 'Your name / channel name', type: 'text' },
    { name: 'brand', label: 'Brand text in the header (optional)', type: 'text' },
    { name: 'tagline', label: 'Tagline', type: 'text' },
    { name: 'bio', label: 'About me (Markdown)', type: 'textarea', rows: 6 },
    { name: 'avatar', label: 'Avatar URL', type: 'text', upload: { bucket: 'images', accept: 'image/*', label: 'Upload avatar' } },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'email', label: 'Public contact email', type: 'text' }
  ] },
  { key: 'links', label: 'Social links', fields: ['twitch', 'youtube', 'discord', 'twitter', 'instagram', 'tiktok'].map((n) => ({ name: n, label: n[0].toUpperCase() + n.slice(1) + ' URL', type: 'text' })) },
  { key: 'support', label: 'Support links', repeater: [['label', 'Name'], ['url', 'Link'], ['note', 'Short note']] },
  { key: 'setup', label: 'My setup', repeater: [['category', 'Category'], ['name', 'Gear / software']] }
];

// ---------- helpers -----------------------------------------------------------
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const parseDuration = (s) => {
  s = String(s || '').trim();
  if (!s) return 0;
  const parts = s.split(':').map((x) => Number(x));
  if (parts.some((n) => isNaN(n) || n < 0)) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};
const fmtDate = (iso, time) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return time ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString([], { dateStyle: 'medium' });
};
const safeName = (n) => String(n).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

let app; // main container
let state = { tab: 'dashboard', games: [], streams: [] };

const notice = (msg, err = false) => el('div', { class: 'notice' + (err ? ' err' : ''), role: err ? 'alert' : 'status', text: msg });

// ---------- form builder ---------------------------------------------------------
function buildForm(fields, values, { gameOptions = [] } = {}) {
  const controls = new Map();
  const wrappers = new Map();
  const form = el('form', { class: 'admin-form', novalidate: true });

  for (const f of fields) {
    let input;
    const v = values[f.name];
    if (f.type === 'textarea') {
      input = el('textarea', { class: 'input', rows: String(f.rows || 4) });
      input.value = v ?? '';
    } else if (f.type === 'select') {
      input = el('select', { class: 'select' });
      const opts = f.from === 'games' ? [['', '— none —'], ...gameOptions] : f.options;
      for (const [val, label] of opts) input.append(el('option', { value: val, text: label }));
      input.value = v ?? '';
    } else if (f.type === 'checkbox') {
      input = el('input', { type: 'checkbox' });
      input.checked = !!v;
    } else if (f.type === 'datetime') {
      input = el('input', { class: 'input', type: 'datetime-local' });
      input.value = toLocalInput(v);
    } else if (f.type === 'date') {
      input = el('input', { class: 'input', type: 'date' });
      input.value = v ? String(v).slice(0, 10) : '';
    } else if (f.type === 'number') {
      input = el('input', { class: 'input', type: 'number' });
      input.value = v ?? 0;
    } else if (f.type === 'duration') {
      input = el('input', { class: 'input', type: 'text', placeholder: '1:23:45' });
      input.value = v ? formatDuration(v) : '';
    } else if (f.type === 'tags') {
      input = el('input', { class: 'input', type: 'text' });
      input.value = Array.isArray(v) ? v.join(', ') : '';
    } else {
      input = el('input', { class: 'input', type: 'text' });
      input.value = v ?? '';
    }
    input.name = f.name;
    controls.set(f.name, input);

    const children = f.type === 'checkbox' ? [input, f.label] : [f.label + (f.required ? ' *' : ''), input];
    const label = el('label', { class: f.type === 'checkbox' ? 'check' : '' }, ...children);
    if (f.hint) label.append(el('small', { class: 'hint', text: f.hint }));

    if (f.upload) {
      const bar = el('div', { class: 'progress', hidden: true }, el('i'));
      const status = el('small', { class: 'hint' });
      const file = el('input', { type: 'file', accept: f.upload.accept });
      file.addEventListener('change', async () => {
        const fl = file.files[0];
        if (!fl) return;
        bar.hidden = false;
        status.textContent = 'Uploading…';
        if (f.upload.detectDuration) {
          const probe = document.createElement('video');
          probe.preload = 'metadata';
          probe.onloadedmetadata = () => {
            const dc = controls.get('duration_seconds');
            if (dc && !dc.value && isFinite(probe.duration)) dc.value = formatDuration(Math.round(probe.duration));
            URL.revokeObjectURL(probe.src);
          };
          probe.src = URL.createObjectURL(fl);
        }
        try {
          const url = await db.upload(f.upload.bucket, `${new Date().getFullYear()}/${Date.now()}-${safeName(fl.name)}`, fl, (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; });
          input.value = url;
          status.textContent = 'Uploaded ✔';
        } catch (e) {
          status.textContent = `Upload failed: ${e.message}`;
        }
      });
      label.append(el('span', { class: 'hint' }, file), bar, status);
      if (f.upload.showWhen) {
        const [dep, val] = f.upload.showWhen;
        wrappers.set(f.name + ':upload', { nodes: [file.parentNode, bar, status], dep, val });
      }
    }
    form.append(label);
  }

  const refresh = () => {
    for (const { nodes, dep, val } of wrappers.values()) {
      const on = controls.get(dep)?.value === val;
      nodes.forEach((n) => { if (n !== nodes[1]) n.hidden = !on; });
      if (!on) nodes[1].hidden = true;
    }
  };
  for (const c of controls.values()) c.addEventListener('change', refresh);
  refresh();

  function read() {
    const out = {};
    for (const f of fields) {
      const c = controls.get(f.name);
      let val;
      if (f.type === 'checkbox') val = c.checked;
      else if (f.type === 'number') val = Number(c.value) || 0;
      else if (f.type === 'duration') val = parseDuration(c.value);
      else if (f.type === 'datetime') val = c.value ? new Date(c.value).toISOString() : null;
      else if (f.type === 'date') val = c.value || null;
      else if (f.type === 'tags') val = c.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (f.type === 'select') val = c.value || null;
      else val = c.value.trim();
      if (val === '' && !f.required && f.type !== 'textarea') val = null;
      out[f.name] = val;
    }
    return out;
  }
  return { form, read, controls };
}

// ---------- views --------------------------------------------------------------------
async function loadLookups() {
  try {
    state.games = await db.select('games', { select: 'id,title,slug', order: 'title.asc' });
    state.streams = await db.select('streams', { select: 'id,title', order: 'published_at.desc' });
  } catch (e) { console.error(e); }
}

function cell(row, [key, , kind]) {
  const v = row[key];
  if (kind === 'game') return state.games.find((g) => g.id === v)?.title || '—';
  if (kind === 'stream') return state.streams.find((s) => s.id === v)?.title || '—';
  if (kind === 'date') return fmtDate(v);
  if (kind === 'datetime') return fmtDate(v, true);
  if (kind === 'bool') return v ? '✔' : '—';
  if (kind === 'long') return el('div', { style: 'max-width:420px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto', text: v });
  return v == null || v === '' ? '—' : String(v);
}

async function viewList(key) {
  const ent = ENTITIES[key];
  const box = el('div', {}, el('p', { class: 'muted', text: 'Loading…' }));
  setContent(box);
  let rows;
  try { rows = await db.select(ent.table, { order: ent.order }); } catch (e) { return setContent(notice(e.message, true)); }
  const table = el('table', { class: 'admin-table' },
    el('thead', {}, el('tr', {}, ...ent.columns.map((c) => el('th', { text: c[1] })), el('th'))),
    el('tbody', {}, ...rows.map((r) => el('tr', {}, ...ent.columns.map((c) => el('td', {}, cell(r, c))),
      el('td', { class: 'actions' },
        ent.readonly ? null : el('button', { class: 'btn btn-tertiary btn-sm', type: 'button', text: 'Edit', onclick: () => viewEdit(key, r) }),
        ' ',
        el('button', { class: 'btn btn-tertiary btn-sm', type: 'button', text: 'Delete', onclick: async () => {
          if (!confirm('Delete this item permanently?')) return;
          try { await db.remove(ent.table, { id: r.id }); await loadLookups(); viewList(key); } catch (e) { alert(e.message); }
        } }))))));
  setContent(el('div', {},
    el('div', { class: 'admin-bar' }, el('h2', { text: ent.label }), ent.readonly ? null : el('button', { class: 'btn btn-primary', type: 'button', text: '+ Add new', onclick: () => viewEdit(key, null) })),
    rows.length ? el('div', { style: 'overflow:auto' }, table) : el('p', { class: 'muted', text: 'Nothing here yet.' })));
}

function viewEdit(key, row) {
  const ent = ENTITIES[key];
  const values = row || ent.defaults();
  const gameOptions = state.games.map((g) => [g.id, g.title]);
  const { form, read } = buildForm(ent.fields, values, { gameOptions });
  const msg = el('div');
  const save = el('button', { class: 'btn btn-primary', type: 'submit', text: row ? 'Save changes' : 'Create' });
  form.append(el('div', { class: 'form-actions' }, save, el('button', { class: 'btn btn-tertiary', type: 'button', text: 'Cancel', onclick: () => viewList(key) })), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = read();
    for (const f of ent.fields) if (f.required && (data[f.name] === '' || data[f.name] == null)) return msg.replaceChildren(notice(`“${f.label}” is required.`, true));
    if (Number.isNaN(data.duration_seconds)) return msg.replaceChildren(notice('Duration must look like 1:23:45.', true));
    if (ent.slugFrom) data.slug = slugify(data.slug || data[ent.slugFrom]);
    save.disabled = true;
    try {
      if (row) await db.update(ent.table, { id: row.id }, data);
      else await db.insert(ent.table, data);
      await loadLookups();
      viewList(key);
    } catch (err) {
      msg.replaceChildren(notice(/duplicate|unique/i.test(err.message) ? 'That URL slug is already used — change the slug.' : err.message, true));
      save.disabled = false;
    }
  });
  setContent(el('div', {}, el('h2', { text: (row ? 'Edit ' : 'New ') + ent.label.toLowerCase() }), form));
}

async function getSetting(key) {
  const rows = await db.select('settings', { filters: { key: `eq.${key}` } });
  return rows[0]?.value;
}
const saveSetting = (key, value) => db.upsert('settings', { key, value, updated_at: new Date().toISOString() }, 'key');

async function viewSettings() {
  setContent(el('p', { class: 'muted', text: 'Loading…' }));
  const wrap = el('div', {}, el('h2', { text: 'Site settings' }), el('p', { class: 'muted', text: 'Anything you leave empty falls back to the values in site.config.json.' }));
  for (const sec of SETTINGS_SECTIONS) {
    let current;
    try { current = (await getSetting(sec.key)) ?? (sec.repeater ? [] : {}); } catch (e) { return setContent(notice(e.message, true)); }
    const msg = el('div');
    let body;
    let read;
    if (sec.repeater) {
      const rowsBox = el('div');
      const addRow = (vals = {}) => {
        const r = el('div', { class: 'row', style: `grid-template-columns:repeat(${sec.repeater.length},1fr) auto;align-items:end;margin-bottom:8px` });
        for (const [name, label] of sec.repeater) { const i = el('input', { class: 'input', placeholder: label, 'aria-label': label, 'data-k': name }); i.value = vals[name] ?? ''; r.append(i); }
        r.append(el('button', { class: 'btn btn-tertiary btn-sm', type: 'button', text: '✕', 'aria-label': 'Remove', onclick: () => r.remove() }));
        rowsBox.append(r);
      };
      (current.length ? current : [{}]).forEach(addRow);
      body = el('div', {}, rowsBox, el('button', { class: 'btn btn-tertiary btn-sm', type: 'button', text: '+ Add row', onclick: () => addRow() }));
      read = () => [...rowsBox.children].map((r) => Object.fromEntries([...r.querySelectorAll('input')].map((i) => [i.dataset.k, i.value.trim()]))).filter((o) => Object.values(o).some(Boolean));
    } else {
      const f = buildForm(sec.fields, current);
      body = f.form;
      read = () => Object.fromEntries(Object.entries(f.read()).map(([k, v]) => [k, v ?? '']));
    }
    const btn = el('button', { class: 'btn btn-primary', type: 'button', text: `Save ${sec.label.toLowerCase()}`, onclick: async () => {
      btn.disabled = true;
      try { await saveSetting(sec.key, read()); msg.replaceChildren(notice('Saved. Publish the site to see the change on public pages.')); } catch (e) { msg.replaceChildren(notice(e.message, true)); }
      btn.disabled = false;
    } });
    wrap.append(el('section', { class: 'panel', style: 'margin-bottom:20px' }, el('h3', { text: sec.label }), body, el('div', { class: 'form-actions', style: 'margin-top:12px' }, btn), msg));
  }
  setContent(wrap);
}

async function viewDashboard() {
  setContent(el('p', { class: 'muted', text: 'Loading…' }));
  const counts = {};
  try {
    for (const t of ['streams', 'games', 'comments', 'messages']) counts[t] = (await db.select(t, { select: 'id' })).length;
  } catch (e) { return setContent(notice(e.message, true)); }
  let live = {};
  try { live = (await getSetting('live')) || {}; } catch { /* ignore */ }

  const title = el('input', { class: 'input', placeholder: 'What are you playing? (shown on the site)' }); title.value = live.title || '';
  const game = el('input', { class: 'input', placeholder: 'Game' }); game.value = live.game || '';
  const url = el('input', { class: 'input', placeholder: 'Link to your live stream (Twitch / YouTube)' }); url.value = live.url || '';
  const msg = el('div');
  const toggle = el('button', { class: 'btn ' + (live.is_live ? 'btn-secondary' : 'btn-primary'), type: 'button', text: live.is_live ? 'End live status' : '● Go live' });
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await saveSetting('live', { is_live: !live.is_live, title: title.value.trim(), game: game.value.trim(), url: url.value.trim() });
      viewDashboard();
    } catch (e) { msg.replaceChildren(notice(e.message, true)); toggle.disabled = false; }
  });

  setContent(el('div', {},
    el('h2', { text: 'Dashboard' }),
    el('div', { class: 'stat-cards' }, ...Object.entries(counts).map(([k, v]) => el('div', { class: 'panel stat' }, el('strong', { text: String(v) }), el('span', { text: k })))),
    el('section', { class: 'panel' },
      el('h3', { text: live.is_live ? '🔴 You are live' : 'Live status' }),
      el('p', { class: 'muted', text: 'Turns the LIVE badge on across the site instantly — no rebuild needed.' }),
      el('div', { class: 'admin-form' }, title, game, url, el('div', { class: 'form-actions' }, toggle)), msg)));
}

function viewPublish() {
  const repo = cfg.githubRepo;
  setContent(el('div', {},
    el('h2', { text: 'Publish to Google' }),
    el('p', {}, 'Public pages (streams, games, blog…) are generated as static HTML so Google can index every video. After you add or edit content the site is rebuilt automatically every 30 minutes.'),
    el('p', {}, 'To publish right now: open GitHub → ', el('strong', { text: 'Actions' }), ' → ', el('strong', { text: 'Build & Deploy' }), ' → ', el('strong', { text: 'Run workflow' }), '.'),
    repo ? el('p', {}, el('a', { class: 'btn btn-primary', href: `https://github.com/${repo}/actions/workflows/deploy.yml`, target: '_blank', rel: 'noopener noreferrer', text: 'Open the workflow on GitHub' })) : el('p', { class: 'muted', text: 'Tip: set "githubRepo" in site.config.json (e.g. "you/gamepov") to get a direct link here.' }),
    el('p', {}, el('a', { class: 'btn btn-tertiary', href: link(''), text: 'Open the public site' }))));
}

// ---------- shell -----------------------------------------------------------------------
const TABS = [['dashboard', 'Dashboard'], ...Object.entries(ENTITIES).map(([k, v]) => [k, v.label]), ['settings', 'Settings'], ['publish', 'Publish']];
let contentBox;
function setContent(node) { contentBox.replaceChildren(node); }

function showTab(tab) {
  state.tab = tab;
  for (const b of app.querySelectorAll('.admin-nav button')) b.classList.toggle('is-active', b.dataset.tab === tab);
  if (tab === 'dashboard') viewDashboard();
  else if (tab === 'settings') viewSettings();
  else if (tab === 'publish') viewPublish();
  else viewList(tab);
}

async function showPanel() {
  await loadLookups();
  contentBox = el('div');
  app.replaceChildren(el('div', { class: 'admin-layout' },
    el('nav', { class: 'admin-nav', 'aria-label': 'Admin' },
      ...TABS.map(([k, label]) => el('button', { type: 'button', 'data-tab': k, text: label, onclick: () => showTab(k) })),
      el('button', { type: 'button', text: 'Log out', onclick: async () => { await db.signOut(); location.reload(); } })),
    contentBox));
  showTab('dashboard');
}

function showLogin(message) {
  const msg = el('div', {}, message ? notice(message, true) : null);
  const email = el('input', { class: 'input', type: 'email', required: true, autocomplete: 'email' });
  const pass = el('input', { class: 'input', type: 'password', required: true, autocomplete: 'current-password' });
  const form = el('form', { class: 'panel form login-box' },
    el('h2', { text: 'Admin login' }),
    el('label', {}, 'Email', email), el('label', {}, 'Password', pass),
    el('div', { class: 'form-actions' }, el('button', { class: 'btn btn-primary', type: 'submit', text: 'Log in' })), msg,
    el('p', { class: 'muted' }, 'First time? ', el('a', { href: link('account/'), text: 'Create the first account' }), ' — it automatically becomes the admin.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await db.signIn(email.value.trim(), pass.value); location.reload(); } catch (err) { msg.replaceChildren(notice(err.message, true)); }
  });
  app.replaceChildren(form);
}

export default async function init() {
  app = document.getElementById('admin-root');
  if (!db.configured) {
    app.replaceChildren(el('div', { class: 'panel login-box' },
      el('h2', { text: 'Backend not connected' }),
      el('p', { text: 'This site is running with demo content. To manage your own streams, connect Supabase:' }),
      el('ol', {}, el('li', { text: 'Create a free project at supabase.com and run supabase/schema.sql in the SQL editor.' }), el('li', { text: 'Put your project URL and anon key into site.config.json (or GitHub secrets).' }), el('li', { text: 'Rebuild the site and open this page again.' }))));
    return;
  }
  if (!db.user) return showLogin();
  let profile = null;
  try { profile = await db.getProfile(); } catch (e) {
    if (/JWT|expired|401/i.test(e.message)) { await db.signOut(); return showLogin('Your session expired. Please log in again.'); }
  }
  if (profile?.role !== 'admin') {
    app.replaceChildren(el('div', { class: 'panel login-box' }, el('h2', { text: 'No access' }), el('p', { text: `Signed in as ${db.user.email}, but this account is not an admin.` }), el('button', { class: 'btn btn-tertiary', type: 'button', text: 'Log out', onclick: async () => { await db.signOut(); location.reload(); } })));
    return;
  }
  await showPanel();
}
