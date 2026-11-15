// End-to-end browser tests: real Chromium + fake Supabase + built site.  Run: node tests/e2e.test.cjs
const { chromium } = require('playwright');
const { execFile } = require('node:child_process');
const execFileSync = (cmd, args, opts) => new Promise((res, rej) => execFile(cmd, args, { cwd: opts.cwd, env: opts.env }, (e, so, se) => (e ? rej(new Error(se || e.message)) : res(so))));
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const MOCK_PORT = 54377, WEB_PORT = 8097;
const BASE = `http://localhost:${WEB_PORT}`;
let failed = 0, passed = 0;

async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 6).join('\n      ')); }
}

(async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepov-e2e-'));
  const { startMock } = await import('./mock-supabase.js');
  const mock = await startMock({ port: MOCK_PORT });
  await execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, DIST_DIR: dist, SITE_URL: BASE, SUPABASE_URL: `http://localhost:${MOCK_PORT}`, SUPABASE_ANON_KEY: 'test-anon-key' } });
  process.env.DIST_DIR = dist;
  const { createServer } = await import('../scripts/serve.js');
  const web = createServer();
  await new Promise((r) => web.listen(WEB_PORT, r));

  const browser = await chromium.launch();
  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
    // keep the run hermetic: no external network (fonts, YouTube, thumbnails)
    await page.route((u) => /^https?:/.test(u.toString()) && !/^http:\/\/localhost:/.test(u.toString()), (r) => r.abort());
    page.errors = errors;
    return { page, ctx };
  };

  console.log('public pages');
  await test('every page loads with an h1 and no JS errors', async () => {
    const { page, ctx } = await newPage();
    const paths = ['', 'streams/', 'clips/', 'games/', 'games/elden-ring/', 'streams/malenia-no-hit-attempt/', 'streams/perfect-parry-malenia/', 'schedule/', 'about/', 'blog/', 'blog/welcome-to-the-new-site/', 'contact/', 'support/', 'stats/', 'account/'];
    for (const p of paths) {
      const res = await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
      assert.equal(res.status(), 200, p);
      assert.ok(await page.locator('h1').first().isVisible(), `h1 on ${p}`);
    }
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
  await test('unknown URL shows the styled 404', async () => {
    const { page, ctx } = await newPage();
    const res = await page.goto(`${BASE}/nope/`);
    assert.equal(res.status(), 404);
    assert.ok(await page.locator('text=404').first().isVisible());
    assert.ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
    await ctx.close();
  });
  await test('home shows latest stream, games, clips and upcoming schedule', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/');
    assert.match(await page.locator('.hero-body h1').innerText(), /Malenia/);
    assert.ok((await page.locator('.stream-card').count()) >= 6);
    assert.equal(await page.locator('.game-card').count(), 5);
    assert.ok((await page.locator('.upcoming-row:visible').count()) >= 1);
    await ctx.close();
  });
  await test('archive filters: search, game, sort, load more', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/streams/');
    const visible = () => page.locator('[data-grid] .card:visible').count();
    assert.equal(await visible(), 10 > 12 ? 12 : 10);
    await page.fill('[data-filter-q]', 'malenia');
    assert.equal(await visible(), 1);
    await page.fill('[data-filter-q]', 'zzzz');
    assert.ok(await page.locator('[data-empty]').isVisible());
    await page.fill('[data-filter-q]', '');
    await page.selectOption('[data-filter-game]', 'elden-ring');
    assert.equal(await visible(), 4);
    await page.selectOption('[data-filter-sort]', 'old');
    assert.match(await page.locator('[data-grid] .card:visible .card-title').first().innerText(), /Melee-only/);
    await page.goto(BASE + '/streams/?q=hades');
    assert.equal(await visible(), 2);
    await ctx.close();
  });
  await test('clips page: kind filter', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/clips/');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 6);
    await page.selectOption('[data-filter-kind]', 'highlight');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 2);
    await ctx.close();
  });
  await test('game page tabs filter streams vs clips', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/games/elden-ring/');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 6);
    await page.click('[data-tab="clip,highlight"]');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 2);
    await page.click('[data-tab="stream"]');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 4);
    await ctx.close();
  });
  await test('header search suggests results and navigates', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/');
    await page.fill('[data-search-input]', 'hollow');
    await page.waitForSelector('[data-search-results] a');
    await page.click('[data-search-results] a');
    await page.waitForURL(/\/(streams|games)\/[a-z0-9-]+\/$/);
    assert.ok(/knight/.test(page.url()));
    await ctx.close();
  });
  await test('language switch → Persian RTL, persists across pages and back', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/');
    await page.click('[data-lang-toggle]');
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await page.getAttribute('html', 'lang'), 'fa');
    assert.match(await page.locator('.nav-link').first().innerText(), /خانه/);
    await page.goto(BASE + '/streams/');
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    assert.match(await page.locator('h1').innerText(), /استریم/);
    assert.equal(await page.getAttribute('[data-filter-q]', 'placeholder'), 'جستجو بر اساس عنوان یا بازی');
    await page.click('[data-lang-toggle]');
    assert.equal(await page.getAttribute('html', 'dir'), 'ltr');
    assert.equal(await page.locator('h1').innerText(), 'Streams');
    await ctx.close();
  });
  await test('stream page: iframe, JSON-LD, copy link, prev/next, related', async () => {
    const { page, ctx } = await newPage();
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await page.goto(BASE + '/streams/malenia-no-hit-attempt/');
    assert.match(await page.getAttribute('.player iframe', 'src'), /youtube-nocookie\.com\/embed\/jNQXAC9IVRw/);
    const ld = await page.$$eval('script[type="application/ld+json"]', (n) => n.map((x) => JSON.parse(x.textContent)));
    assert.ok(ld.some((x) => x['@type'] === 'VideoObject'));
    await page.click('[data-copy-link]');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), BASE + '/streams/malenia-no-hit-attempt/');
    assert.ok(await page.locator('.pager a').count() >= 1);
    assert.ok((await page.locator('.comments ~ .section .stream-card, .section .stream-card').count()) >= 1);
    await ctx.close();
  });
  await test('schedule: local time + countdown + calendar link', async () => {
    const { page, ctx } = await newPage({ timezoneId: 'Asia/Tehran' });
    await page.goto(BASE + '/schedule/');
    assert.match(await page.locator('[data-countdown]').first().innerText(), /in \d+h/);
    assert.match(await page.getAttribute('.schedule-item a[download]', 'href'), /^data:text\/calendar/);
    assert.match(await page.locator('[data-tz]').innerText(), /Tehran/);
    await ctx.close();
  });
  await test('mobile layout: no horizontal scroll, menu toggles', async () => {
    const { page, ctx } = await newPage({ viewport: { width: 375, height: 800 } });
    for (const p of ['', 'streams/', 'streams/malenia-no-hit-attempt/', 'stats/', 'schedule/']) {
      await page.goto(`${BASE}/${p}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `horizontal overflow ${over}px on /${p}`);
    }
    await page.goto(BASE + '/');
    assert.ok(!(await page.locator('.main-nav').isVisible()));
    await page.click('[data-nav-toggle]');
    assert.ok(await page.locator('.main-nav').isVisible());
    await ctx.close();
  });

  console.log('accounts, comments, contact');
  let viewerCtx;
  await test('first signup becomes admin; second is a viewer who can comment', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/account/');
    await page.fill('[data-signup-form] [name=display_name]', 'Boss');
    await page.fill('[data-signup-form] [name=email]', 'admin@example.com');
    await page.fill('[data-signup-form] [name=password]', 'secret123');
    await page.click('[data-signup-form] button');
    await page.waitForSelector('[data-account-user]:not([hidden])');
    assert.match(await page.locator('[data-user-role]').innerText(), /Admin/);
    assert.ok(await page.locator('[data-admin-link]').isVisible());
    assert.equal((await page.locator('[data-auth-link]').innerText()).trim(), 'Boss');
    const adminState = await ctx.storageState();
    fs.writeFileSync(path.join(dist, 'admin-state.json'), JSON.stringify(adminState));
    await ctx.close();

    const v = await newPage();
    viewerCtx = v.ctx;
    await v.page.goto(BASE + '/account/');
    await v.page.fill('[data-signup-form] [name=display_name]', 'Fan<b>One</b>');
    await v.page.fill('[data-signup-form] [name=email]', 'fan@example.com');
    await v.page.fill('[data-signup-form] [name=password]', 'secret123');
    await v.page.click('[data-signup-form] button');
    await v.page.waitForSelector('[data-account-user]:not([hidden])');
    assert.match(await v.page.locator('[data-user-role]').innerText(), /Viewer/);
    assert.ok(!(await v.page.locator('[data-admin-link]').isVisible()));
    await v.page.goto(BASE + '/streams/malenia-no-hit-attempt/');
    await v.page.waitForSelector('.comment');
    assert.match(await v.page.locator('.comment').first().innerText(), /Waterfowl/);
    await v.page.fill('.comment-form textarea', 'Great run <img src=x onerror=alert(1)>');
    await v.page.click('.comment-form button');
    await v.page.waitForFunction(() => document.querySelectorAll('.comment').length === 2);
    assert.equal(await v.page.locator('.comment img').count(), 0, 'comment text must not be rendered as HTML');
    assert.match(await v.page.locator('.comment').nth(1).innerText(), /Great run <img/);
    assert.equal(mock.db.comments.length, 2);
    // viewer can delete own comment
    await v.page.locator('.comment').nth(1).locator('.link-btn').click();
    await v.page.waitForFunction(() => document.querySelectorAll('.comment').length === 1);
    assert.deepEqual(v.page.errors, []);
  });
  await test('guest sees login prompt instead of comment box; wrong password shows error', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/streams/malenia-no-hit-attempt/');
    await page.waitForSelector('.comment');
    assert.ok(await page.locator('[data-comments-form] a').isVisible());
    assert.equal(await page.locator('.comment-form').count(), 0);
    await page.goto(BASE + '/account/');
    await page.fill('[data-login-form] [name=email]', 'fan@example.com');
    await page.fill('[data-login-form] [name=password]', 'wrong');
    await page.click('[data-login-form] button');
    await page.waitForFunction(() => /Invalid/.test(document.querySelector('[data-login-form] [data-status]').textContent));
    await ctx.close();
  });
  await test('contact form validates and stores the message', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/contact/');
    await page.click('[data-contact-form] button');
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.length > 0);
    assert.equal(mock.db.messages.length, 0);
    await page.fill('[name=name]', 'Sponsor Sam');
    await page.fill('[name=email]', 'sam@brand.com');
    await page.fill('[name=body]', 'Let us collaborate!');
    await page.click('[data-contact-form] button');
    await page.waitForFunction(() => /sent/i.test(document.querySelector('[data-status]').textContent));
    assert.equal(mock.db.messages.length, 1);
    assert.equal(mock.db.messages[0].name, 'Sponsor Sam');
    await ctx.close();
  });

  console.log('admin panel');
  const adminState = () => JSON.parse(fs.readFileSync(path.join(dist, 'admin-state.json'), 'utf8'));
  await test('non-admin and guests cannot use the admin panel', async () => {
    const g = await newPage();
    await g.page.goto(BASE + '/admin/');
    await g.page.waitForSelector('text=Admin login');
    await g.ctx.close();
    const state = JSON.parse(JSON.stringify(await viewerCtx.storageState()));
    const v = await newPage({ storageState: state });
    await v.page.goto(BASE + '/admin/');
    await v.page.waitForSelector('text=No access');
    await v.ctx.close();
  });
  await test('admin: dashboard, add game, add stream (+upload thumbnail), edit, delete', async () => {
    const { page, ctx } = await newPage({ storageState: adminState() });
    await page.goto(BASE + '/admin/');
    await page.waitForSelector('.admin-nav');
    assert.ok(await page.locator('text=Dashboard').first().isVisible());

    // game
    await page.click('.admin-nav >> text=Games');
    await page.click('text=+ Add new');
    await page.fill('input[name=title]', 'Cyber Test Game');
    await page.fill('input[name=tags]', 'FPS, Test');
    await page.click('button:has-text("Create")');
    await page.waitForSelector('td:has-text("Cyber Test Game")');
    const game = mock.db.games.find((g) => g.title === 'Cyber Test Game');
    assert.equal(game.slug, 'cyber-test-game');
    assert.deepEqual(game.tags, ['FPS', 'Test']);

    // stream with youtube source + thumbnail upload
    await page.click('.admin-nav >> text=Streams & clips');
    await page.click('text=+ Add new');
    await page.fill('input[name=title]', 'Admin Made Stream');
    await page.selectOption('select[name=game_id]', game.id);
    await page.fill('input[name=video_ref]', 'https://youtu.be/jNQXAC9IVRw');
    await page.fill('input[name=duration_seconds]', '1:02:03');
    await page.setInputFiles('label:has(input[name=thumbnail_url]) input[type=file]', { name: 'thumb.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
    await page.waitForFunction(() => /^http.*storage.*thumb\.png$/.test(document.querySelector('input[name=thumbnail_url]').value));
    await page.fill('textarea[name=description]', 'Chapters: 0:00 intro');
    await page.click('button:has-text("Create")');
    await page.waitForSelector('td:has-text("Admin Made Stream")');
    const s = mock.db.streams.find((x) => x.title === 'Admin Made Stream');
    assert.equal(s.slug, 'admin-made-stream');
    assert.equal(s.duration_seconds, 3723);
    assert.equal(s.game_id, game.id);
    assert.ok([...mock.files.keys()].some((k) => k.startsWith('images/') && k.endsWith('thumb.png')), 'file stored in mock storage');

    // duplicate slug is reported
    await page.click('text=+ Add new');
    await page.fill('input[name=title]', 'Another');
    await page.fill('input[name=slug]', 'admin-made-stream');
    await page.fill('input[name=video_ref]', 'jNQXAC9IVRw');
    await page.click('button:has-text("Create")');
    await page.waitForSelector('text=slug is already used');
    await page.click('button:has-text("Cancel")');

    // edit
    await page.locator('tr:has-text("Admin Made Stream") button:has-text("Edit")').click();
    await page.fill('input[name=title]', 'Admin Made Stream v2');
    await page.click('button:has-text("Save changes")');
    await page.waitForSelector('td:has-text("Admin Made Stream v2")');
    assert.equal(mock.db.streams.find((x) => x.id === s.id).title, 'Admin Made Stream v2');

    // upload source shows file picker only for "upload"
    await page.click('text=+ Add new');
    assert.equal(await page.locator('input[type=file][accept="video/*"]').isVisible(), false);
    await page.selectOption('select[name=source]', 'upload');
    assert.equal(await page.locator('input[type=file][accept="video/*"]').isVisible(), true);
    await page.setInputFiles('input[type=file][accept="video/*"]', { name: 'my stream.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(2048, 1) });
    await page.waitForFunction(() => /storage.*my-stream\.mp4$/.test(document.querySelector('input[name=video_ref]').value));
    await page.click('button:has-text("Cancel")');

    // delete
    page.once('dialog', (d) => d.accept());
    await page.locator('tr:has-text("Admin Made Stream v2") button:has-text("Delete")').click();
    await page.waitForFunction(() => !document.body.textContent.includes('Admin Made Stream v2'));
    assert.ok(!mock.db.streams.some((x) => x.id === s.id));
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
  await test('admin: schedule, post, comments moderation, messages', async () => {
    const { page, ctx } = await newPage({ storageState: adminState() });
    await page.goto(BASE + '/admin/');
    await page.click('.admin-nav >> text=Schedule');
    await page.click('text=+ Add new');
    await page.fill('input[name=title]', 'Admin scheduled show');
    await page.fill('input[name=starts_at]', '2030-01-01T20:30');
    await page.click('button:has-text("Create")');
    await page.waitForSelector('td:has-text("Admin scheduled show")');
    assert.ok(mock.db.schedule.some((x) => x.title === 'Admin scheduled show' && x.starts_at.startsWith('2030-01-0')));

    await page.click('.admin-nav >> text=Blog posts');
    await page.click('text=+ Add new');
    await page.fill('input[name=title]', 'Post from admin');
    await page.fill('textarea[name=body]', '## Hi\n\nBody');
    await page.click('button:has-text("Create")');
    await page.waitForSelector('td:has-text("Post from admin")');
    assert.equal(mock.db.posts.find((p) => p.title === 'Post from admin').slug, 'post-from-admin');

    await page.click('.admin-nav >> text=Messages');
    await page.waitForSelector('td:has-text("Sponsor Sam")');
    await page.click('.admin-nav >> text=Comments');
    await page.waitForSelector('td:has-text("Viewer One")');
    page.once('dialog', (d) => d.accept());
    await page.locator('tr:has-text("Viewer One") button:has-text("Delete")').click();
    await page.waitForFunction(() => !document.body.textContent.includes('Viewer One'));
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
  await test('admin: settings save + live toggle shows LIVE on the public site instantly', async () => {
    const { page, ctx } = await newPage({ storageState: adminState() });
    await page.goto(BASE + '/admin/');
    await page.click('.admin-nav >> text=Settings');
    await page.waitForSelector('text=Site settings');
    await page.locator('section:has(h3:text("Profile")) input[name=tagline]').fill('New tagline from admin');
    await page.click('button:has-text("Save profile")');
    await page.waitForSelector('text=Saved.');
    assert.equal(mock.db.settings.find((r) => r.key === 'profile').value.tagline, 'New tagline from admin');
    // repeater
    const sup = page.locator('section:has(h3:text("Support links"))');
    await sup.locator('button:has-text("+ Add row")').click();
    await sup.locator('input[data-k=label]').last().fill('Streamlabs');
    await sup.locator('input[data-k=url]').last().fill('https://streamlabs.com/x');
    await sup.locator('button:has-text("Save support links")').click();
    await sup.locator('text=Saved.').waitFor();
    assert.ok(mock.db.settings.find((r) => r.key === 'support').value.some((x) => x.label === 'Streamlabs'));

    await page.click('.admin-nav >> text=Dashboard');
    await page.fill('input[placeholder^="What are you playing"]', 'Boss rush night');
    await page.fill('input[placeholder="Link to your live stream (Twitch / YouTube)"]', 'https://twitch.tv/test');
    await page.click('button:has-text("Go live")');
    await page.waitForSelector('text=You are live');
    await ctx.close();

    const guest = await newPage();
    await guest.page.goto(BASE + '/');
    await guest.page.waitForSelector('#live-banner:not([hidden])');
    assert.match(await guest.page.locator('[data-live-title]').innerText(), /Boss rush night/);
    assert.ok(await guest.page.locator('#live-pill').isVisible());
    assert.equal(await guest.page.getAttribute('#live-banner', 'href'), 'https://twitch.tv/test');
    await guest.ctx.close();

    const a2 = await newPage({ storageState: adminState() });
    await a2.page.goto(BASE + '/admin/');
    await a2.page.click('button:has-text("End live status")');
    await a2.page.waitForSelector('text=Live status');
    assert.equal(mock.db.settings.find((r) => r.key === 'live').value.is_live, false);
    await a2.ctx.close();
  });
  await test('admin changes appear after a rebuild (full publish loop)', async () => {
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepov-e2e2-'));
    await execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, DIST_DIR: out2, SITE_URL: BASE, SUPABASE_URL: `http://localhost:${MOCK_PORT}`, SUPABASE_ANON_KEY: 'k' } });
    const read = (f) => fs.readFileSync(path.join(out2, f), 'utf8');
    assert.ok(fs.existsSync(path.join(out2, 'games/cyber-test-game/index.html')));
    assert.ok(fs.existsSync(path.join(out2, 'blog/post-from-admin/index.html')));
    assert.ok(read('index.html').includes('New tagline from admin'));
    assert.ok(read('support/index.html').includes('Streamlabs'));
    assert.ok(read('sitemap.xml').includes('blog/post-from-admin/'));
    // unpublished streams must stay out
    mock.db.streams.push({ id: 'hidden1', slug: 'secret-vod', title: 'Secret VOD', game_id: null, kind: 'stream', source: 'youtube', video_ref: 'jNQXAC9IVRw', duration_seconds: 10, published_at: new Date().toISOString(), is_published: false });
    await execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, DIST_DIR: out2, SITE_URL: BASE, SUPABASE_URL: `http://localhost:${MOCK_PORT}`, SUPABASE_ANON_KEY: 'k' } });
    assert.ok(!fs.existsSync(path.join(out2, 'streams/secret-vod/index.html')));
    fs.rmSync(out2, { recursive: true, force: true });
  });


  console.log('Persian (fa) completeness');
  const { DICT } = await import('../src/js/lib/i18n.js');
  await test('every translatable element switches to Persian on every page (no English left over)', async () => {
    const { page, ctx } = await newPage();
    const paths = ['', 'streams/', 'clips/', 'games/', 'games/elden-ring/', 'streams/malenia-no-hit-attempt/', 'schedule/', 'about/', 'blog/', 'blog/welcome-to-the-new-site/', 'contact/', 'support/', 'stats/', 'account/', 'nope/'];
    const bad = [];
    for (const p of paths) {
      await page.goto(`${BASE}/${p}`);
      await page.evaluate(() => localStorage.setItem('gamepov.lang', 'fa'));
      await page.reload();
      await page.waitForFunction(() => document.documentElement.lang === 'fa');
      const res = await page.evaluate((fa) => {
        const out = [];
        for (const n of document.querySelectorAll('[data-i18n]')) {
          let want = fa[n.dataset.i18n];
          if (want == null) { out.push('missing key ' + n.dataset.i18n); continue; }
          if (n.dataset.vars) for (const [k, v] of Object.entries(JSON.parse(n.dataset.vars))) want = want.replace(`{${k}}`, v);
          if (n.textContent !== want) out.push(`${n.dataset.i18n}: "${n.textContent}" ≠ "${want}"`);
        }
        for (const n of document.querySelectorAll('[data-i18n-ph]')) if (n.placeholder !== fa[n.dataset.i18nPh]) out.push('ph ' + n.dataset.i18nPh);
        for (const n of document.querySelectorAll('[data-i18n-aria]')) if (n.getAttribute('aria-label') !== fa[n.dataset.i18nAria]) out.push('aria ' + n.dataset.i18nAria);
        if (document.documentElement.dir !== 'rtl') out.push('dir is not rtl');
        if (!getComputedStyle(document.body).fontFamily.startsWith('Vazirmatn')) out.push('font is ' + getComputedStyle(document.body).fontFamily);
        return out;
      }, DICT.fa);
      for (const r of res) bad.push(`/${p}: ${r}`);
    }
    assert.deepEqual(bad, []);
    assert.ok(await page.evaluate(async () => { await document.fonts.load('16px Vazirmatn', 'سلام'); return document.fonts.check('16px Vazirmatn', 'سلام'); }), 'Vazirmatn font file loads');
    await ctx.close();
  });
  await test('Persian dynamic parts: schedule countdown, comments UI, form messages, auth', async () => {
    const { page, ctx } = await newPage();
    await page.goto(BASE + '/schedule/');
    await page.evaluate(() => localStorage.setItem('gamepov.lang', 'fa'));
    await page.reload();
    assert.match(await page.locator('[data-countdown]').first().innerText(), /^تا .* دیگر$/);
    await page.goto(BASE + '/contact/');
    await page.click('[data-contact-form] button');
    assert.equal(await page.locator('[data-status]').innerText(), DICT.fa['form.required']);
    await page.goto(BASE + '/streams/malenia-no-hit-attempt/');
    await page.waitForSelector('[data-comments-form] a');
    assert.equal(await page.locator('[data-comments-form] a').innerText(), DICT.fa['comments.login']);
    // date rendering uses the Persian calendar
    assert.match(await page.locator('.video-meta time').innerText(), /[۰-۹]/);
    await ctx.close();
  });

  console.log('offline: open preview/index.html by double-click (file://)');
  const prev = fs.mkdtempSync(path.join(os.tmpdir(), 'gamepov-preview-'));
  await execFileSync('node', ['scripts/build.js', '--local'], { cwd: root, env: { ...process.env, DIST_DIR: prev, SUPABASE_URL: '', SUPABASE_ANON_KEY: '' } });
  const F = 'file://' + prev;
  await test('file:// — pages navigate, no errors, language toggle works, search works', async () => {
    const { page, ctx } = await newPage();
    await page.unroute(() => true).catch(() => {});
    await page.goto(F + '/index.html');
    assert.match(await page.locator('.hero-body h1').innerText(), /Malenia/);
    await page.click('.main-nav >> text=Streams');
    await page.waitForURL(/streams\/index\.html$/);
    assert.equal(await page.locator('h1').innerText(), 'Streams');
    await page.fill('[data-filter-q]', 'malenia');
    assert.equal(await page.locator('[data-grid] .card:visible').count(), 1);
    await page.click('[data-grid] .card:visible');
    await page.waitForURL(/streams\/malenia-no-hit-attempt\/index\.html$/);
    await page.click('[data-lang-toggle]');
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    assert.match(await page.locator('.nav-link').first().innerText(), /خانه/);
    await page.click('.main-nav a >> nth=1'); // games
    await page.waitForURL(/games\/index\.html$/);
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    assert.match(await page.locator('h1').innerText(), /بازی/);
    await page.click('[data-lang-toggle]');
    await page.fill('[data-search-input]', 'hades');
    await page.waitForSelector('[data-search-results] a');
    await page.click('[data-search-results] a >> nth=0');
    await page.waitForURL(/index\.html$/);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
  await test('file:// — every internal link on every preview page resolves to a file', async () => {
    const bad = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.html') && !p.endsWith('404.html')) {
      const html = fs.readFileSync(p, 'utf8');
      for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) { const u = m[1]; if (/^(https?:|mailto:|data:|#|javascript:)/.test(u)) continue; const t = path.resolve(path.dirname(p), u.split('#')[0].split('?')[0]); if (!fs.existsSync(t) || fs.statSync(t).isDirectory()) bad.push(path.relative(prev, p) + ' → ' + u); }
    } } })(prev);
    assert.deepEqual(bad, []);
  });
  fs.rmSync(prev, { recursive: true, force: true });

  await browser.close();
  web.close();
  mock.close();
  fs.rmSync(dist, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
