#!/usr/bin/env node
// Static site generator: reads content (Supabase or demo) and writes ./dist
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, backendOf } from './lib/load-data.js';
import { createSite } from './lib/templates.js';
import { bundle } from './lib/bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// --local builds the "preview" folder: every link ends in index.html and no server is needed,
// so the site can be opened by double-clicking preview/index.html.
const local = process.argv.includes('--local') || process.env.LOCAL_PREVIEW === '1';
const dist = path.resolve(process.env.DIST_DIR || path.join(root, local ? 'preview' : 'dist'));

function readConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
  if (process.env.SITE_URL) cfg.siteUrl = process.env.SITE_URL;
  return cfg;
}

function write(rel, content) {
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

const favicon = (accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0A0A0A"/><path d="M44 22a14 14 0 1 0 0 20v-9H33" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;

async function main() {
  const cfg = readConfig();
  const data = await loadData(cfg);
  const site = createSite(cfg, data);
  const be = backendOf(cfg);

  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  copyDir(path.join(root, 'src/css'), path.join(dist, 'css'));
  copyDir(path.join(root, 'src/fonts'), path.join(dist, 'fonts'));
  write('js/app.bundle.js', bundle(path.join(root, 'src/js')));

  const publicCfg = {
    siteName: cfg.siteName,
    defaultLang: cfg.defaultLang === 'fa' ? 'fa' : 'en',
    supabaseUrl: be.url,
    anonKey: be.anonKey,
    buckets: cfg.buckets,
    githubRepo: cfg.githubRepo || '',
    live: data.settings.live,
    demo: data.source === 'demo',
    local
  };
  write('config.js', `window.GAMEPOV = ${JSON.stringify(publicCfg)};\n`);
  write('favicon.svg', favicon(cfg.theme?.accent || '#E8650A'));
  write('.nojekyll', '');
  if (cfg.customDomain) write('CNAME', cfg.customDomain + '\n');

  const localize = (html) =>
    html
      .replace(/<link rel="preload"[^>]*as="font"[^>]*>\n?/g, '') // crossorigin preloads are blocked on file://
      .replace(/href="([^"]*)"/g, (m, u) => {
        if (/^(https?:|mailto:|data:|#|javascript:)/.test(u)) return m;
        const i = u.search(/[?#]/);
        const a = i < 0 ? u : u.slice(0, i);
        const rest = i < 0 ? '' : u.slice(i);
        return a === '' || a.endsWith('/') ? `href="${a}index.html${rest}"` : m;
      })
      .replace(/(<script src="([^"]*)config\.js"><\/script>)/, '<script src="$2search-data.js"></script>$1');
  for (const p of site.pages) write(path.join(p.path, 'index.html'), local ? localize(p.html) : p.html);
  write('404.html', local ? localize(site.notFound) : site.notFound);
  if (local) write('search-data.js', `window.GAMEPOV_SEARCH = ${JSON.stringify(site.searchIndex())};\n`);
  write('sitemap.xml', site.sitemap());
  write('robots.txt', site.robots());
  write('feed.xml', site.feed());
  write('search.json', JSON.stringify(site.searchIndex()));

  console.log(`Built ${site.pages.length} pages from ${data.source} data → ${path.relative(process.cwd(), dist) || '.'}`);
  console.log(`  streams: ${data.streams.length}, games: ${data.games.length}, posts: ${data.posts.length}`);
  if (data.source === 'demo') console.log('  (Supabase not configured — using demo content from data/demo.json)');
}

main().catch((e) => {
  console.error('Build failed:', e.message);
  process.exit(1);
});
