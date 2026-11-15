// Dependency-free unit + build tests. Run: node tests/unit.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { slugify, formatDuration, isoDuration, parseYouTubeId, parseTwitch, resolveVideo, miniMarkdown, esc, truncate } from '../src/js/lib/util.js';
import { DICT } from '../src/js/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };

console.log('util');
test('slugify', () => {
  assert.equal(slugify('Malenia, Blade of Miquella — no-hit!'), 'malenia-blade-of-miquella-no-hit');
  assert.match(slugify('سلام'), /^item-/);
  assert.equal(slugify('  A  B  '), 'a-b');
});
test('formatDuration / isoDuration', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(isoDuration(3725), 'PT1H2M5S');
  assert.equal(isoDuration(60), 'PT1M');
  assert.equal(isoDuration(0), 'PT0S');
});
test('parseYouTubeId', () => {
  const id = 'jNQXAC9IVRw';
  for (const u of [id, `https://www.youtube.com/watch?v=${id}&t=10`, `https://youtu.be/${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/live/${id}`, `https://youtube.com/shorts/${id}`]) assert.equal(parseYouTubeId(u), id, u);
  assert.equal(parseYouTubeId('not a video'), null);
});
test('parseTwitch', () => {
  assert.deepEqual(parseTwitch('https://www.twitch.tv/videos/123456'), { kind: 'video', id: '123456' });
  assert.deepEqual(parseTwitch('123456'), { kind: 'video', id: '123456' });
  assert.deepEqual(parseTwitch('https://clips.twitch.tv/FunnyClipSlug'), { kind: 'clip', id: 'FunnyClipSlug' });
  assert.deepEqual(parseTwitch('https://www.twitch.tv/someone/clip/AbcDef-123'), { kind: 'clip', id: 'AbcDef-123' });
});
test('resolveVideo', () => {
  const y = resolveVideo({ source: 'youtube', video_ref: 'jNQXAC9IVRw' });
  assert.equal(y.type, 'iframe'); assert.match(y.src, /youtube-nocookie\.com\/embed\/jNQXAC9IVRw/);
  const t = resolveVideo({ source: 'twitch', video_ref: '999' }, { host: 'me.github.io' });
  assert.match(t.src, /parent=me\.github\.io/);
  const u = resolveVideo({ source: 'upload', video_ref: 'https://x.supabase.co/storage/v1/object/public/videos/a.mp4' });
  assert.equal(u.type, 'video');
  assert.equal(resolveVideo({ source: 'youtube', video_ref: 'bad' }).type, 'none');
});
test('miniMarkdown escapes HTML and renders basics', () => {
  const h = miniMarkdown('# Hi <script>alert(1)</script>\n\n- a\n- **b**\n\n[x](https://e.com) and [bad](javascript:alert(1))');
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('<h2>') && h.includes('<li><strong>b</strong></li>'));
  assert.ok(h.includes('href="https://e.com"'));
  assert.ok(!h.includes('href="javascript'));
});
test('esc / truncate', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(truncate('<b>hello</b> world', 8), 'hello w…');
});

console.log('i18n');
test('en and fa have exactly the same keys', () => {
  const en = Object.keys(DICT.en).sort(); const fa = Object.keys(DICT.fa).sort();
  assert.deepEqual(en.filter((k) => !fa.includes(k)), [], 'missing in fa');
  assert.deepEqual(fa.filter((k) => !en.includes(k)), [], 'missing in en');
  for (const k of en) assert.ok(DICT.fa[k].trim(), `empty fa: ${k}`);
});
test('every key used in templates / client code exists', () => {
  const files = ['scripts/lib/templates.js', 'src/js/app.js', ...fs.readdirSync(path.join(root, 'src/js/pages')).filter((f) => f !== 'admin.js').map((f) => 'src/js/pages/' + f)];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/\b(?:T|txt|PH|ARIA|t|sectionHead)\(\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)*)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n="([a-z0-9_.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/'((?:auth|form|comments|schedule|copy)\.[a-z_]+)'/g)) used.add(m[1]);
  }
  used.add('kind.stream'); used.add('kind.clip'); used.add('kind.highlight');
  const missing = [...used].filter((k) => !(k in DICT.en));
  assert.deepEqual(missing, []);
});

console.log('build');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepov-build-'));
execFileSync('node', ['scripts/build.js'], { cwd: root, env: { ...process.env, DIST_DIR: out, SITE_URL: 'https://example.com/site', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: 'pipe' });
const htmlFiles = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith('.html') && htmlFiles.push(p); } })(out);

test('expected pages exist', () => {
  for (const f of ['index.html', 'streams/index.html', 'clips/index.html', 'games/index.html', 'schedule/index.html', 'about/index.html', 'blog/index.html', 'contact/index.html', 'support/index.html', 'stats/index.html', 'account/index.html', 'admin/index.html', '404.html', 'sitemap.xml', 'robots.txt', 'feed.xml', 'search.json', 'config.js', 'streams/malenia-no-hit-attempt/index.html', 'games/elden-ring/index.html', 'blog/welcome-to-the-new-site/index.html']) assert.ok(fs.existsSync(path.join(out, f)), f);
});
test('all relative links and assets resolve', () => {
  const bad = [];
  for (const f of htmlFiles) {
    if (f.endsWith('404.html')) continue;
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|data:|#|javascript:)/.test(u)) continue;
      const clean = u.split('#')[0].split('?')[0];
      let target = path.resolve(path.dirname(f), clean);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) bad.push(`${path.relative(out, f)} → ${u}`);
    }
  }
  assert.deepEqual(bad, []);
});
test('every page has title, description, canonical (except noindex) and valid JSON-LD', () => {
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    const rel = path.relative(out, f);
    assert.match(html, /<title>[^<]+<\/title>/, rel);
    assert.match(html, /<meta name="description" content="[^"]*">/, rel);
    if (!/noindex/.test(html)) assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/site\//, rel);
    for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
  }
});
test('HTML structure is balanced on every page (no mismatched open/close tags)', () => {
  const tags = ['div', 'nav', 'section', 'main', 'article', 'aside', 'header', 'footer', 'form', 'table', 'tbody', 'thead', 'tr', 'ul', 'dl', 'select', 'button', 'a', 'span', 'label', 'h1', 'h2', 'h3', 'p'];
  const bad = [];
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const stack = [];
    for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
      const [, close, name, self] = m;
      const n = name.toLowerCase();
      if (!tags.includes(n) || self) continue;
      if (!close) stack.push(n);
      else if (stack.at(-1) === n) stack.pop();
      else { bad.push(`${path.relative(out, f)}: </${n}> closes <${stack.at(-1)}>`); break; }
    }
    if (stack.length && !bad.some((b) => b.startsWith(path.relative(out, f)))) bad.push(`${path.relative(out, f)}: unclosed <${stack.at(-1)}>`);
  }
  assert.deepEqual(bad, []);
});
test('stream page has VideoObject with required fields', () => {
  const html = fs.readFileSync(path.join(out, 'streams/malenia-no-hit-attempt/index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const v = blocks.find((b) => b['@type'] === 'VideoObject');
  assert.ok(v, 'VideoObject');
  for (const k of ['name', 'description', 'uploadDate', 'duration', 'embedUrl']) assert.ok(v[k], k);
  assert.equal(v.duration, 'PT2H14M8S');
  assert.ok(html.includes('youtube-nocookie.com/embed/'));
  assert.ok(html.includes('og:video') || html.includes('og:type" content="video.other"'));
});
test('sitemap lists streams and excludes admin/account; robots points to it', () => {
  const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.ok(sm.includes('https://example.com/site/streams/malenia-no-hit-attempt/'));
  assert.ok(!sm.includes('/admin/') && !sm.includes('/account/'));
  const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Sitemap: https://example.com/site/sitemap.xml'));
});
test('404 uses absolute base path of siteUrl', () => {
  assert.ok(fs.readFileSync(path.join(out, '404.html'), 'utf8').includes('href="/site/css/style.css"'));
});
test('no unescaped user content (xss) in cards', () => {
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(!/<script>alert/.test(home));
});
fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

// ---- bundle / fonts / local preview ----
{
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-local-'));
  execFileSync('node', ['scripts/build.js', '--local'], { cwd: root, env: { ...process.env, DIST_DIR: tmp, SUPABASE_URL: '', SUPABASE_ANON_KEY: '' } });
  test('bundle is a classic script (no import/export)', () => {
    const b = fs.readFileSync(path.join(tmp, 'js/app.bundle.js'), 'utf8');
    assert.ok(!/^\s*(import|export)\s/m.test(b));
    assert.ok(!fs.readFileSync(path.join(tmp, 'index.html'), 'utf8').includes('type="module"'));
  });
  test('local fonts are shipped, no Google Fonts / preload', () => {
    for (const f of ['Inter-Variable-latin.woff2', 'Vazirmatn-Variable.woff2']) assert.ok(fs.statSync(path.join(tmp, 'fonts', f)).size > 10000);
    const h = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    assert.ok(!h.includes('fonts.googleapis') && !h.includes('rel="preload"'));
  });
  test('local preview links end in index.html', () => {
    const h = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    assert.ok(h.includes('streams/index.html') && fs.existsSync(path.join(tmp, 'search-data.js')));
  });
}
