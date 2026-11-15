// HTML templates for every public page. Pure functions: (config, data) → page strings.
import {
  esc, formatDuration, isoDuration, formatDate, formatDateTime, resolveVideo, miniMarkdown, truncate
} from '../../src/js/lib/util.js';
import { DICT } from '../../src/js/lib/i18n.js';

export const NAV = [
  ['nav.home', ''],
  ['nav.games', 'games/'],
  ['nav.streams', 'streams/'],
  ['nav.clips', 'clips/'],
  ['nav.schedule', 'schedule/'],
  ['nav.blog', 'blog/'],
  ['nav.about', 'about/'],
  ['nav.support', 'support/']
];

export function createSite(cfg, data) {
  const lang = cfg.defaultLang === 'fa' ? 'fa' : 'en';
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const siteUrl = String(cfg.siteUrl || '').replace(/\/+$/, '');
  let host = 'localhost';
  try { host = new URL(siteUrl).hostname; } catch { /* keep */ }
  const profile = data.settings.profile;
  const links = data.settings.links || {};
  const brand = profile.brand || profile.name || cfg.siteName;

  const gamesById = new Map(data.games.map((g) => [g.id, g]));
  const gameIndex = new Map(data.games.map((g, i) => [g.id, i]));
  const streams = data.streams; // published, newest first
  const onlyStreams = streams.filter((s) => s.kind === 'stream');
  const onlyClips = streams.filter((s) => s.kind !== 'stream');

  // ----- text helpers ------------------------------------------------
  const txt = (key) => esc(DICT[lang][key] ?? DICT.en[key] ?? key);
  const T = (key, vars) => {
    let s = DICT[lang][key] ?? DICT.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    const v = vars ? ` data-vars='${esc(JSON.stringify(vars))}'` : '';
    return `<span data-i18n="${key}"${v}>${esc(s)}</span>`;
  };
  const PH = (key) => `placeholder="${txt(key)}" data-i18n-ph="${key}"`;
  const ARIA = (key) => `aria-label="${txt(key)}" data-i18n-aria="${key}"`;
  const dateEl = (iso, fmt = 'date') =>
    `<time datetime="${esc(iso)}" data-fmt="${fmt}">${esc(fmt === 'datetime' ? formatDateTime(iso, lang) : formatDate(iso, lang))}</time>`;

  const mediaOf = (s) => resolveVideo(s, { host });
  const thumbSrc = (s) => s.thumbnail_url || (cfg.youtubeAutoThumbnails ? mediaOf(s).thumb : '') || '';
  const absolute = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${siteUrl}/${String(u).replace(/^\/+/, '')}`);

  const playIcon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

  // ----- components --------------------------------------------------
  function thumb(s) {
    const src = thumbSrc(s);
    const game = gamesById.get(s.game_id);
    const angle = 120 + ((gameIndex.get(s.game_id) ?? 0) * 37) % 120;
    return `<div class="thumb" style="--angle:${angle}deg">` +
      `<span class="thumb-ph">${esc(game?.title || s.title)}</span>` +
      (src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : '') +
      `<span class="play">${playIcon}</span>` +
      (s.duration_seconds ? `<span class="dur">${formatDuration(s.duration_seconds)}</span>` : '') +
      (s.kind !== 'stream' ? `<span class="kind-badge">${T('kind.' + s.kind)}</span>` : '') +
      `</div>`;
  }

  function streamCard(s, R) {
    const game = gamesById.get(s.game_id);
    return `<a class="card stream-card" href="${R}streams/${esc(s.slug)}/" data-kind="${esc(s.kind)}" data-game="${esc(game?.slug || '')}" data-ts="${new Date(s.published_at).getTime()}" data-q="${esc((s.title + ' ' + (game?.title || '')).toLowerCase())}">` +
      thumb(s) +
      `<h3 class="card-title">${esc(s.title)}</h3>` +
      `<div class="card-meta"><span class="chip">${esc(game?.title || '—')}</span><span class="muted">${dateEl(s.published_at)}</span></div>` +
      `</a>`;
  }

  function gameCard(g, R) {
    const count = streams.filter((s) => s.game_id === g.id).length;
    const angle = 120 + ((gameIndex.get(g.id) ?? 0) * 37) % 120;
    return `<a class="game-card" href="${R}games/${esc(g.slug)}/" style="--angle:${angle}deg">` +
      (g.cover_url ? `<img src="${esc(g.cover_url)}" alt="" loading="lazy" onerror="this.remove()">` : '') +
      `<span class="game-card-body"><strong>${esc(g.title)}</strong><small>${T('n_videos', { n: count })}</small></span></a>`;
  }

  const socialLinks = () =>
    Object.entries(links)
      .filter(([, u]) => u)
      .map(([k, u]) => `<a href="${esc(u)}" rel="me noopener noreferrer" target="_blank" class="social-link">${esc(k.charAt(0).toUpperCase() + k.slice(1))}</a>`)
      .join('');

  function sectionHead(titleKey, href) {
    return `<div class="section-head"><h2>${T(titleKey)}</h2>${href ? `<a class="more" href="${href}">${T('btn.view_all')} →</a>` : ''}</div>`;
  }

  function filterBar({ kinds = false, withSort = true } = {}) {
    return `<div class="filters" data-filters>` +
      `<input type="search" class="input" data-filter-q ${PH('filter.search')} ${ARIA('filter.search')}>` +
      `<select class="select" data-filter-game ${ARIA('filter.game')}><option value="" data-i18n="filter.all_games">${txt('filter.all_games')}</option>` +
      data.games.map((g) => `<option value="${esc(g.slug)}">${esc(g.title)}</option>`).join('') + `</select>` +
      (kinds
        ? `<select class="select" data-filter-kind ${ARIA('filter.kind')}><option value="" data-i18n="filter.all_kinds">${txt('filter.all_kinds')}</option><option value="clip" data-i18n="kind.clip">${txt('kind.clip')}</option><option value="highlight" data-i18n="kind.highlight">${txt('kind.highlight')}</option></select>`
        : '') +
      (withSort
        ? `<select class="select" data-filter-sort ${ARIA('filter.sort')}><option value="new" data-i18n="filter.newest">${txt('filter.newest')}</option><option value="old" data-i18n="filter.oldest">${txt('filter.oldest')}</option></select>`
        : '') +
      `</div>`;
  }

  function gridBlock(cards) {
    return `<div class="grid grid-3" data-grid data-page-size="12">${cards.join('')}</div>` +
      `<p class="empty" data-empty hidden>${T('filter.none')}</p>` +
      `<div class="center"><button type="button" class="btn btn-tertiary" data-load-more hidden>${T('btn.load_more')}</button></div>`;
  }

  // ----- layout ------------------------------------------------------
  function layout({ title, desc, path = '', body, page, image = '', type = 'website', jsonld = [], noindex = false, root = null, canonical = true }) {
    const R = root ?? '../'.repeat(path.split('/').filter(Boolean).length);
    const url = `${siteUrl}/${path}`;
    const fullTitle = title ? `${title} — ${brand}` : `${brand} — ${truncate(profile.tagline, 60)}`;
    const description = truncate(desc || profile.tagline || '', 160);
    const img = absolute(image);
    const ld = jsonld.length
      ? jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')
      : '';
    const t = cfg.theme || {};
    const themeVars = `:root{--accent:${t.accent || '#E8650A'};--accent-light:${t.accentLight || '#FF8A2B'};--bg:${t.bg || '#0A0A0A'};--page:${t.page || '#121212'};--header:${t.header || '#1C1A18'}}`;
    return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1">'}
${canonical ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:site_name" content="${esc(brand)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title || brand)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title || brand)}">
<meta name="twitter:description" content="${esc(description)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ''}
<meta name="theme-color" content="${esc(t.header || '#1C1A18')}">
<link rel="icon" href="${R}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(brand)}" href="${R}feed.xml">
<link rel="preload" href="${R}fonts/Inter-Variable-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${R}css/style.css">
<style>${themeVars}</style>
${ld}
</head>
<body data-page="${page}" data-root="${R}" data-default-lang="${lang}">
<a class="skip" href="#main">${T('a11y.skip')}</a>
${header(R, path)}
<main id="main">
${body(R)}
</main>
${footer(R)}
<script src="${R}config.js"></script>
<script src="${R}js/app.bundle.js" defer></script>
</body>
</html>
`;
  }

  function header(R, path) {
    const nav = NAV.map(([k, href]) => {
      const active = href === '' ? path === '' : path.startsWith(href);
      return `<a href="${R}${href}" class="nav-link${active ? ' is-active' : ''}"${active ? ' aria-current="page"' : ''}>${T(k)}</a>`;
    }).join('');
    return `<header class="site-header">
<div class="header-inner">
<a class="brand" href="${R}">${esc(brand)}</a>
<button class="nav-toggle" type="button" data-nav-toggle ${ARIA('a11y.menu')} aria-expanded="false"><span></span><span></span><span></span></button>
<nav class="main-nav" data-nav ${ARIA('a11y.main_nav')}>${nav}</nav>
<div class="header-tools">
<a class="live-pill" id="live-pill" href="${R}" hidden><i></i>${T('live.badge')}</a>
<div class="search" data-search>
<input type="search" class="input" data-search-input ${PH('search.ph')} ${ARIA('search.ph')} autocomplete="off">
<div class="search-results" data-search-results hidden></div>
</div>
<button type="button" class="lang-toggle" data-lang-toggle ${ARIA('a11y.lang')}><span data-lang-opt="en">EN</span><span class="sep">|</span><span data-lang-opt="fa">FA</span></button>
<a class="btn btn-tertiary btn-sm" data-auth-link href="${R}account/">${T('btn.login')}</a>
</div>
</div>
</header>`;
  }

  function footer(R) {
    return `<footer class="site-footer">
<div class="container footer-grid">
<div><div class="brand">${esc(brand)}</div><p class="muted">${esc(profile.tagline || '')}</p><div class="socials">${socialLinks()}</div></div>
<div><h4>${T('footer.explore')}</h4><a href="${R}games/">${T('nav.games')}</a><a href="${R}streams/">${T('nav.streams')}</a><a href="${R}clips/">${T('nav.clips')}</a><a href="${R}schedule/">${T('nav.schedule')}</a><a href="${R}stats/">${T('nav.stats')}</a></div>
<div><h4>${T('footer.community')}</h4><a href="${R}blog/">${T('nav.blog')}</a><a href="${R}account/">${T('nav.account')}</a><a href="${R}support/">${T('nav.support')}</a></div>
<div><h4>${T('footer.contact')}</h4><a href="${R}about/">${T('nav.about')}</a><a href="${R}contact/">${T('nav.contact')}</a><a href="${R}feed.xml">RSS</a></div>
</div>
<div class="container footer-bottom"><span>© ${new Date().getFullYear()} ${esc(brand)}. ${T('footer.rights')}</span><span>${T('footer.built')} <a href="https://github.com/Mr-AREZ" rel="noopener noreferrer" target="_blank">Gamepov</a></span></div>
</footer>`;
  }

  // ----- JSON-LD -------------------------------------------------------
  const personLd = () => ({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    description: profile.bio,
    url: siteUrl + '/',
    sameAs: Object.values(links).filter(Boolean)
  });
  const websiteLd = () => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand,
    url: siteUrl + '/',
    inLanguage: lang,
    potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/streams/?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
  });
  const breadcrumbLd = (items) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url }))
  });
  function videoLd(s) {
    const m = mediaOf(s);
    const game = gamesById.get(s.game_id);
    const o = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: s.title,
      description: truncate(s.description || s.title, 300),
      uploadDate: new Date(s.published_at).toISOString(),
      thumbnailUrl: [absolute(thumbSrc(s))].filter(Boolean),
      duration: isoDuration(s.duration_seconds),
      inLanguage: lang,
      url: `${siteUrl}/streams/${s.slug}/`
    };
    if (!o.thumbnailUrl.length) delete o.thumbnailUrl;
    if (m.embedUrl) o.embedUrl = m.embedUrl;
    if (m.contentUrl) o.contentUrl = m.contentUrl;
    if (game) o.about = { '@type': 'VideoGame', name: game.title };
    return o;
  }

  // ----- pages ---------------------------------------------------------
  const pages = [];
  const add = (path, opts) => pages.push({ path, html: layout({ path, ...opts }) });

  // Home
  {
    const featured = onlyStreams[0] || streams[0];
    const upcoming = data.schedule.slice(0, 4);
    add('', {
      page: 'home',
      title: '',
      desc: profile.tagline,
      image: featured ? thumbSrc(featured) : '',
      jsonld: [websiteLd(), personLd()],
      body: (R) => `
<div class="container">
<a class="live-banner" id="live-banner" href="${R}" hidden><span class="live-dot"></span><strong>${T('live.now')}</strong><span data-live-title></span><span class="btn btn-primary btn-sm">${T('btn.watch_live')}</span></a>
<section class="hero">
${featured ? `<a class="hero-main" href="${R}streams/${esc(featured.slug)}/" style="--angle:${150}deg">
${thumbSrc(featured) ? `<img src="${esc(thumbSrc(featured))}" alt="" onerror="this.remove()">` : ''}
<div class="hero-body"><span class="badge">${T('hero.latest')}</span><h1>${esc(featured.title)}</h1>
<p class="muted">${esc(gamesById.get(featured.game_id)?.title || '')} · ${dateEl(featured.published_at)} · ${formatDuration(featured.duration_seconds)}</p>
<span class="btn btn-primary">${T('btn.watch_now')}</span></div></a>` : `<div class="hero-main"><div class="hero-body"><h1>${esc(brand)}</h1><p class="muted">${esc(profile.tagline)}</p></div></div>`}
<aside class="panel upcoming"><h3>${T('sec.upcoming')}</h3>
${upcoming.length ? upcoming.map((e) => `<div class="upcoming-row" data-start="${esc(e.starts_at)}"><small class="accent">${dateEl(e.starts_at, 'datetime')}</small><strong>${esc(e.title)}</strong></div>`).join('') : `<p class="muted">${T('schedule.none')}</p>`}
<a class="more" href="${R}schedule/">${T('btn.full_schedule')} →</a></aside>
</section>
<section class="section">${sectionHead('sec.latest_streams', R + 'streams/')}<div class="grid grid-3">${onlyStreams.slice(0, 6).map((s) => streamCard(s, R)).join('')}</div></section>
<section class="section">${sectionHead('sec.games', R + 'games/')}<div class="game-row">${data.games.slice(0, 5).map((g) => gameCard(g, R)).join('')}</div></section>
${onlyClips.length ? `<section class="section">${sectionHead('sec.clips', R + 'clips/')}<div class="grid grid-3">${onlyClips.slice(0, 3).map((s) => streamCard(s, R)).join('')}</div></section>` : ''}
<section class="section about-teaser panel"><div><h2>${esc(profile.name)}</h2><p>${esc(truncate(profile.bio, 260))}</p><a class="btn btn-secondary" href="${R}about/">${T('btn.about_me')}</a></div><div class="socials">${socialLinks()}</div></section>
</div>`
    });
  }

  // Streams archive
  add('streams/', {
    page: 'archive',
    title: txt('nav.streams'),
    desc: txt('desc.archive'),
    jsonld: [breadcrumbLd([[brand, siteUrl + '/'], [txt('nav.streams'), siteUrl + '/streams/']])],
    body: (R) => `<div class="container"><h1 class="page-title">${T('nav.streams')}</h1><p class="muted lead">${T('desc.archive')}</p>${filterBar()}${gridBlock(onlyStreams.map((s) => streamCard(s, R)))}</div>`
  });

  // Clips
  add('clips/', {
    page: 'archive',
    title: txt('nav.clips'),
    desc: txt('desc.clips'),
    body: (R) => `<div class="container"><h1 class="page-title">${T('sec.clips')}</h1><p class="muted lead">${T('desc.clips')}</p>${filterBar({ kinds: true })}${gridBlock(onlyClips.map((s) => streamCard(s, R)))}</div>`
  });

  // Stream / clip detail
  for (const s of streams) {
    const m = mediaOf(s);
    const game = gamesById.get(s.game_id);
    const related = streams.filter((x) => x.id !== s.id && x.game_id === s.game_id).slice(0, 3);
    const idx = streams.findIndex((x) => x.id === s.id);
    const newer = streams[idx - 1];
    const older = streams[idx + 1];
    const player =
      m.type === 'iframe'
        ? `<iframe src="${esc(m.src)}" title="${esc(s.title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
        : m.type === 'video'
          ? `<video controls preload="metadata" ${thumbSrc(s) ? `poster="${esc(thumbSrc(s))}"` : ''}><source src="${esc(m.src)}"></video>`
          : `<div class="player-missing">${T('player.missing')}</div>`;
    add(`streams/${s.slug}/`, {
      page: 'stream',
      type: 'video.other',
      title: s.title,
      desc: s.description || `${s.title} — ${game?.title || ''}`,
      image: thumbSrc(s),
      jsonld: [videoLd(s), breadcrumbLd([[brand, siteUrl + '/'], [txt('nav.streams'), siteUrl + '/streams/'], [s.title, `${siteUrl}/streams/${s.slug}/`]])],
      body: (R) => `<div class="container narrow-wide">
<nav class="crumbs" aria-label="breadcrumb"><a href="${R}">${T('nav.home')}</a> / <a href="${R}${s.kind === 'stream' ? 'streams/' : 'clips/'}">${T(s.kind === 'stream' ? 'nav.streams' : 'nav.clips')}</a> / <span>${esc(s.title)}</span></nav>
<div class="player" data-kind-media="${m.type}">${player}</div>
<h1 class="video-title">${esc(s.title)}</h1>
<div class="video-meta">
${game ? `<a class="chip chip-link" href="${R}games/${esc(game.slug)}/">${esc(game.title)}</a>` : ''}
<span class="chip">${T('kind.' + s.kind)}</span>
<span class="muted">${dateEl(s.published_at)}</span>
${s.duration_seconds ? `<span class="muted">${formatDuration(s.duration_seconds)}</span>` : ''}
<span class="grow"></span>
<button type="button" class="btn btn-tertiary btn-sm" data-copy-link>${T('btn.copy_link')}</button>
${m.watchUrl ? `<a class="btn btn-tertiary btn-sm" href="${esc(m.watchUrl)}" target="_blank" rel="noopener noreferrer">${T('btn.open_original')}</a>` : ''}
</div>
${s.description ? `<div class="panel prose description">${esc(s.description).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
<div class="pager">${newer ? `<a class="btn btn-tertiary" href="${R}streams/${esc(newer.slug)}/">← ${T('btn.newer')}</a>` : '<span></span>'}${older ? `<a class="btn btn-tertiary" href="${R}streams/${esc(older.slug)}/">${T('btn.older')} →</a>` : ''}</div>
<section class="section comments" id="comments" data-stream-id="${esc(s.id)}">
<h2>${T('comments.title')}</h2>
<div data-comments-form></div>
<div data-comments-list class="comment-list" aria-live="polite"></div>
</section>
${related.length ? `<section class="section">${sectionHead('sec.more_game')}<div class="grid grid-3">${related.map((x) => streamCard(x, R)).join('')}</div></section>` : ''}
</div>`
    });
  }

  // Games
  add('games/', {
    page: 'games',
    title: txt('nav.games'),
    desc: txt('desc.games'),
    body: (R) => `<div class="container"><h1 class="page-title">${T('nav.games')}</h1><p class="muted lead">${T('desc.games')}</p><div class="game-grid">${data.games.map((g) => gameCard(g, R)).join('')}</div></div>`
  });

  for (const g of data.games) {
    const list = streams.filter((s) => s.game_id === g.id);
    const secs = list.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const first = list.at(-1);
    const last = list[0];
    const angle = 120 + ((gameIndex.get(g.id) ?? 0) * 37) % 120;
    add(`games/${g.slug}/`, {
      page: 'archive',
      title: g.title,
      desc: g.description || `${g.title} streams, clips and highlights.`,
      image: g.cover_url || (list[0] ? thumbSrc(list[0]) : ''),
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, description: g.description || undefined, genre: g.genre || undefined, gamePlatform: g.platform || undefined },
        breadcrumbLd([[brand, siteUrl + '/'], [txt('nav.games'), siteUrl + '/games/'], [g.title, `${siteUrl}/games/${g.slug}/`]])
      ],
      body: (R) => `<div class="container">
<nav class="crumbs"><a href="${R}">${T('nav.home')}</a> / <a href="${R}games/">${T('nav.games')}</a> / <span>${esc(g.title)}</span></nav>
<h1 class="page-title">${esc(g.title)}</h1>
<div class="game-top">
<div class="game-cover" style="--angle:${angle}deg">${g.cover_url ? `<img src="${esc(g.cover_url)}" alt="${esc(g.title)}" onerror="this.remove()">` : `<span>${esc(g.title)}</span>`}</div>
<aside class="panel game-info">
<p class="muted">${esc(g.description || '')}</p>
<dl>
<dt>${T('game.videos')}</dt><dd>${list.length}</dd>
<dt>${T('game.hours')}</dt><dd>${(secs / 3600).toFixed(1)}</dd>
${first ? `<dt>${T('game.first')}</dt><dd>${dateEl(first.published_at)}</dd>` : ''}
${last ? `<dt>${T('game.last')}</dt><dd>${dateEl(last.published_at)}</dd>` : ''}
${g.platform ? `<dt>${T('game.platform')}</dt><dd>${esc(g.platform)}</dd>` : ''}
${g.genre ? `<dt>${T('game.genre')}</dt><dd>${esc(g.genre)}</dd>` : ''}
</dl>
<div class="tags">${(g.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
${last ? `<a class="btn btn-primary" href="${R}streams/${esc(last.slug)}/">${T('btn.watch_latest')}</a>` : ''}
</aside></div>
<div class="filters" data-filters data-fixed-game="${esc(g.slug)}">
<div class="tabs" role="tablist"><button class="tab is-active" type="button" data-tab="">${T('tab.all')} (${list.length})</button><button class="tab" type="button" data-tab="stream">${T('nav.streams')} (${list.filter((s) => s.kind === 'stream').length})</button><button class="tab" type="button" data-tab="clip,highlight">${T('sec.clips')} (${list.filter((s) => s.kind !== 'stream').length})</button></div>
<select class="select" data-filter-sort ${ARIA('filter.sort')}><option value="new" data-i18n="filter.newest">${txt('filter.newest')}</option><option value="old" data-i18n="filter.oldest">${txt('filter.oldest')}</option></select>
</div>
${gridBlock(list.map((s) => streamCard(s, R)))}
</div>`
    });
  }

  // Schedule
  function icsLink(e) {
    const dt = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = new Date(new Date(e.starts_at).getTime() + 2 * 3600 * 1000).toISOString();
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gamepov//EN', 'BEGIN:VEVENT', `UID:${e.id}@${host}`, `DTSTAMP:${dt(new Date().toISOString())}`, `DTSTART:${dt(e.starts_at)}`, `DTEND:${dt(end)}`, `SUMMARY:${String(e.title).replace(/[\n,;]/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body);
  }
  add('schedule/', {
    page: 'schedule',
    title: txt('nav.schedule'),
    desc: txt('desc.schedule'),
    jsonld: data.schedule.slice(0, 10).map((e) => ({ '@context': 'https://schema.org', '@type': 'BroadcastEvent', name: e.title, startDate: e.starts_at, isLiveBroadcast: true, videoFormat: 'HD' })),
    body: (R) => `<div class="container narrow"><h1 class="page-title">${T('nav.schedule')}</h1><p class="muted lead">${T('desc.schedule')} <span class="tz" data-tz></span></p>
<div class="schedule-list">${data.schedule.length ? data.schedule.map((e) => {
      const g = gamesById.get(e.game_id);
      return `<article class="panel schedule-item" data-start="${esc(e.starts_at)}"><div class="when accent">${dateEl(e.starts_at, 'datetime')}<small class="countdown" data-countdown></small></div><div><h3>${esc(e.title)}</h3>${g ? `<a class="chip chip-link" href="${R}games/${esc(g.slug)}/">${esc(g.title)}</a>` : ''}${e.notes ? `<p class="muted">${esc(e.notes)}</p>` : ''}</div><a class="btn btn-tertiary btn-sm" href="${icsLink(e)}" download="stream.ics">${T('btn.add_calendar')}</a></article>`;
    }).join('') : `<p class="empty">${T('schedule.none')}</p>`}</div></div>`
  });

  // About
  add('about/', {
    page: 'about',
    title: txt('nav.about'),
    desc: profile.bio,
    jsonld: [personLd()],
    body: () => `<div class="container narrow"><h1 class="page-title">${T('nav.about')}</h1>
<div class="about-head panel"><div class="avatar">${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="${esc(profile.name)}">` : `<span>${esc(String(profile.name || '?').slice(0, 1))}</span>`}</div>
<div><h2>${esc(profile.name)}</h2>${profile.location ? `<p class="muted">📍 ${esc(profile.location)}</p>` : ''}<div class="prose">${miniMarkdown(profile.bio)}</div><div class="socials">${socialLinks()}</div></div></div>
${(data.settings.setup || []).length ? `<h2 class="sub">${T('about.setup')}</h2><div class="panel"><table class="setup"><tbody>${data.settings.setup.map((r) => `<tr><th>${esc(r.category)}</th><td>${esc(r.name)}</td></tr>`).join('')}</tbody></table></div>` : ''}
</div>`
  });

  // Blog
  add('blog/', {
    page: 'blog',
    title: txt('nav.blog'),
    desc: txt('desc.blog'),
    body: (R) => `<div class="container narrow"><h1 class="page-title">${T('nav.blog')}</h1><p class="muted lead">${T('desc.blog')}</p>
<div class="post-list">${data.posts.length ? data.posts.map((p) => `<a class="panel post-item" href="${R}blog/${esc(p.slug)}/"><small class="accent">${dateEl(p.published_at)}</small><h3>${esc(p.title)}</h3><p class="muted">${esc(p.excerpt || truncate(p.body, 160))}</p></a>`).join('') : `<p class="empty">${T('blog.none')}</p>`}</div></div>`
  });
  for (const p of data.posts) {
    add(`blog/${p.slug}/`, {
      page: 'post',
      type: 'article',
      title: p.title,
      desc: p.excerpt || p.body,
      image: p.cover_url,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, datePublished: new Date(p.published_at).toISOString(), author: { '@type': 'Person', name: profile.name }, description: truncate(p.excerpt || p.body, 200), image: p.cover_url ? absolute(p.cover_url) : undefined, mainEntityOfPage: `${siteUrl}/blog/${p.slug}/` }],
      body: (R) => `<article class="container narrow"><nav class="crumbs"><a href="${R}">${T('nav.home')}</a> / <a href="${R}blog/">${T('nav.blog')}</a> / <span>${esc(p.title)}</span></nav><h1 class="page-title">${esc(p.title)}</h1><p class="muted">${dateEl(p.published_at)}</p>${p.cover_url ? `<img class="post-cover" src="${esc(p.cover_url)}" alt="" onerror="this.remove()">` : ''}<div class="prose">${miniMarkdown(p.body)}</div></article>`
    });
  }

  // Contact & sponsors
  add('contact/', {
    page: 'contact',
    title: txt('nav.contact'),
    desc: txt('desc.contact'),
    body: () => `<div class="container narrow"><h1 class="page-title">${T('nav.contact')}</h1><p class="muted lead">${T('desc.contact')}</p>
<form class="panel form" data-contact-form novalidate>
<label>${T('form.name')}<input class="input" name="name" required maxlength="120" autocomplete="name"></label>
<label>${T('form.email')}<input class="input" type="email" name="email" required maxlength="200" autocomplete="email"></label>
<label>${T('form.subject')}<input class="input" name="subject" maxlength="200"></label>
<label>${T('form.message')}<textarea class="input" name="body" rows="6" required maxlength="5000"></textarea></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="form-actions"><button class="btn btn-primary" type="submit">${T('btn.send')}</button><span class="form-status" role="status" data-status></span></div>
</form>
${profile.email ? `<p class="muted">${T('contact.direct')} <a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></p>` : ''}
${data.sponsors.length ? `<h2 class="sub">${T('contact.sponsors')}</h2><div class="sponsor-grid">${data.sponsors.map((s) => `<a class="panel sponsor" ${s.url ? `href="${esc(s.url)}" target="_blank" rel="sponsored noopener noreferrer"` : ''}>${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="${esc(s.name)}" onerror="this.remove()">` : ''}<strong>${esc(s.name)}</strong></a>`).join('')}</div>` : ''}
</div>`
  });

  // Support
  add('support/', {
    page: 'support',
    title: txt('nav.support'),
    desc: txt('desc.support'),
    body: () => `<div class="container narrow"><h1 class="page-title">${T('nav.support')}</h1><p class="muted lead">${T('desc.support')}</p>
<div class="support-grid">${(data.settings.support || []).map((s) => `<a class="panel support-card" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(s.label)}</strong><span class="muted">${esc(s.note || '')}</span><span class="btn btn-primary btn-sm">${T('btn.support_now')}</span></a>`).join('')}</div>
<p class="muted">${T('support.thanks')}</p></div>`
  });

  // Stats
  {
    const secs = onlyStreams.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const byGame = data.games.map((g) => ({ g, secs: streams.filter((s) => s.game_id === g.id && s.kind === 'stream').reduce((a, s) => a + s.duration_seconds, 0) })).filter((x) => x.secs).sort((a, b) => b.secs - a.secs);
    const maxG = byGame[0]?.secs || 1;
    const months = new Map();
    for (const s of onlyStreams) {
      const k = new Date(s.published_at).toISOString().slice(0, 7);
      months.set(k, (months.get(k) || 0) + s.duration_seconds);
    }
    const mk = [...months.entries()].sort().slice(-8);
    const maxM = Math.max(1, ...mk.map(([, v]) => v));
    add('stats/', {
      page: 'stats',
      title: txt('nav.stats'),
      desc: txt('desc.stats'),
      body: () => `<div class="container"><h1 class="page-title">${T('nav.stats')}</h1><p class="muted lead">${T('desc.stats')}</p>
<div class="stat-cards">
<div class="panel stat"><strong>${onlyStreams.length}</strong><span>${T('stats.streams')}</span></div>
<div class="panel stat"><strong>${(secs / 3600).toFixed(0)}</strong><span>${T('stats.hours')}</span></div>
<div class="panel stat"><strong>${data.games.length}</strong><span>${T('stats.games')}</span></div>
<div class="panel stat"><strong>${onlyClips.length}</strong><span>${T('stats.clips')}</span></div>
</div>
<div class="two-col">
<section class="panel"><h3>${T('stats.top_games')}</h3>${byGame.map(({ g, secs: v }) => `<div class="bar-row"><span>${esc(g.title)}</span><div class="bar"><i style="width:${Math.max(4, Math.round((v / maxG) * 100))}%"></i></div><small>${(v / 3600).toFixed(1)} h</small></div>`).join('') || `<p class="muted">—</p>`}</section>
<section class="panel"><h3>${T('stats.by_month')}</h3><div class="month-bars">${mk.map(([k, v]) => `<div class="mbar"><i style="height:${Math.max(6, Math.round((v / maxM) * 100))}%"></i><small>${k.slice(2)}</small></div>`).join('') || `<p class="muted">—</p>`}</div></section>
</div>
<h2 class="sub">${T('stats.achievements')}</h2>
<div class="ach-grid">${data.achievements.map((a) => `<div class="panel ach"><span class="ach-icon">${esc(a.icon || '🏆')}</span><div><strong>${esc(a.title)}</strong><p class="muted">${esc(a.description || '')}</p>${a.achieved_at ? `<small class="muted">${dateEl(a.achieved_at + 'T00:00:00Z')}</small>` : ''}</div></div>`).join('') || `<p class="muted">—</p>`}</div>
</div>`
    });
  }

  // Account
  add('account/', {
    page: 'account',
    title: txt('nav.account'),
    desc: txt('desc.account'),
    noindex: true,
    body: () => `<div class="container narrow"><h1 class="page-title">${T('nav.account')}</h1>
<div data-account-guest class="auth-grid">
<form class="panel form" data-login-form novalidate><h3>${T('btn.login')}</h3>
<label>${T('form.email')}<input class="input" type="email" name="email" required autocomplete="email"></label>
<label>${T('form.password')}<input class="input" type="password" name="password" required autocomplete="current-password"></label>
<div class="form-actions"><button class="btn btn-primary" type="submit">${T('btn.login')}</button><span class="form-status" role="status" data-status></span></div></form>
<form class="panel form" data-signup-form novalidate><h3>${T('btn.signup')}</h3>
<label>${T('form.display_name')}<input class="input" name="display_name" required maxlength="40" autocomplete="nickname"></label>
<label>${T('form.email')}<input class="input" type="email" name="email" required autocomplete="email"></label>
<label>${T('form.password')}<input class="input" type="password" name="password" required minlength="6" autocomplete="new-password"></label>
<div class="form-actions"><button class="btn btn-secondary" type="submit">${T('btn.signup')}</button><span class="form-status" role="status" data-status></span></div></form>
</div>
<div data-account-user class="panel" hidden><h3 data-user-name></h3><p class="muted" data-user-email></p><p><span class="chip" data-user-role></span></p>
<div class="form-actions"><a class="btn btn-primary" data-admin-link href="${'../'}admin/" hidden>${T('btn.open_admin')}</a><button class="btn btn-tertiary" type="button" data-logout>${T('btn.logout')}</button></div></div>
<p class="muted" data-no-backend hidden>${T('account.no_backend')}</p></div>`
  });

  // Admin shell (client rendered)
  add('admin/', {
    page: 'admin',
    title: 'Admin',
    desc: 'Admin panel',
    noindex: true,
    canonical: false,
    body: () => `<div class="container admin-wrap"><div id="admin-root"><p class="muted">Loading…</p></div></div>`
  });

  // 404 (absolute paths so it works at any depth)
  let basePath = '/';
  try { basePath = new URL(siteUrl).pathname.replace(/\/+$/, '') + '/'; } catch { /* keep */ }
  const notFound = layout({
    path: '404.html', root: basePath, page: 'notfound', noindex: true, canonical: false,
    title: '404',
    desc: txt('notfound.text'),
    body: (R) => `<div class="container narrow center"><h1 class="page-title">404</h1><p class="lead">${T('notfound.text')}</p><a class="btn btn-primary" href="${R}">${T('nav.home')}</a></div>`
  });

  // ----- machine-readable files -----------------------------------------
  const urls = pages.filter((p) => !/^(admin|account)\//.test(p.path)).map((p) => p.path);
  const sitemap = () => {
    const rows = urls.map((p) => {
      const s = streams.find((x) => `streams/${x.slug}/` === p);
      const post = data.posts.find((x) => `blog/${x.slug}/` === p);
      const last = s?.published_at || post?.published_at;
      let video = '';
      if (s) {
        const m = mediaOf(s);
        const th = absolute(thumbSrc(s));
        if (th) {
          video = `<video:video><video:thumbnail_loc>${esc(th)}</video:thumbnail_loc><video:title>${esc(s.title)}</video:title><video:description>${esc(truncate(s.description || s.title, 300))}</video:description>${m.contentUrl ? `<video:content_loc>${esc(m.contentUrl)}</video:content_loc>` : ''}${m.embedUrl ? `<video:player_loc>${esc(m.embedUrl)}</video:player_loc>` : ''}<video:duration>${Math.max(1, s.duration_seconds)}</video:duration><video:publication_date>${new Date(s.published_at).toISOString()}</video:publication_date></video:video>`;
        }
      }
      return `<url><loc>${esc(siteUrl + '/' + p)}</loc>${last ? `<lastmod>${new Date(last).toISOString()}</lastmod>` : ''}${video}</url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${rows.join('\n')}\n</urlset>\n`;
  };
  const robots = () => `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  const feed = () => {
    const items = [
      ...streams.map((s) => ({ t: s.title, u: `${siteUrl}/streams/${s.slug}/`, d: s.description || '', at: s.published_at })),
      ...data.posts.map((p) => ({ t: p.title, u: `${siteUrl}/blog/${p.slug}/`, d: p.excerpt || p.body, at: p.published_at }))
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(brand)}</title><link>${esc(siteUrl)}/</link><description>${esc(profile.tagline || '')}</description>${items.map((i) => `<item><title>${esc(i.t)}</title><link>${esc(i.u)}</link><guid>${esc(i.u)}</guid><pubDate>${new Date(i.at).toUTCString()}</pubDate><description>${esc(truncate(i.d, 300))}</description></item>`).join('')}</channel></rss>\n`;
  };
  const searchIndex = () => [
    ...streams.map((s) => ({ t: s.title, g: gamesById.get(s.game_id)?.title || '', u: `streams/${s.slug}/`, k: s.kind })),
    ...data.games.map((g) => ({ t: g.title, g: '', u: `games/${g.slug}/`, k: 'game' })),
    ...data.posts.map((p) => ({ t: p.title, g: '', u: `blog/${p.slug}/`, k: 'post' }))
  ];

  return { pages, notFound, sitemap, robots, feed, searchIndex };
}
