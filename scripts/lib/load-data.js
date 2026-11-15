import { createClient } from '../../src/js/lib/supa.js';
import { loadDemo } from './demo.js';

const memoryStorage = { getItem: () => null, setItem() {}, removeItem() {} };

export function backendOf(cfg) {
  return {
    url: process.env.SUPABASE_URL || cfg.supabase?.url || '',
    anonKey: process.env.SUPABASE_ANON_KEY || cfg.supabase?.anonKey || ''
  };
}

/** Load everything the site needs, from Supabase when configured, otherwise from demo data. */
export async function loadData(cfg) {
  const { url, anonKey } = backendOf(cfg);
  let raw;
  let source;
  if (url && anonKey) {
    source = 'supabase';
    const db = createClient({ url, anonKey, storage: memoryStorage });
    const [games, streams, schedule, posts, achievements, sponsors, settings, ] = await Promise.all([
      db.select('games', { order: 'created_at.asc' }),
      db.select('streams', { filters: { is_published: 'eq.true' }, order: 'published_at.desc' }),
      db.select('schedule', { order: 'starts_at.asc' }),
      db.select('posts', { filters: { is_published: 'eq.true' }, order: 'published_at.desc' }),
      db.select('achievements', { order: 'achieved_at.desc' }),
      db.select('sponsors', { order: 'sort_order.asc' }),
      db.select('settings')
    ]);
    raw = { games, streams, schedule, posts, achievements, sponsors, settings: Object.fromEntries(settings.map((r) => [r.key, r.value])) };
  } else {
    source = 'demo';
    raw = loadDemo();
  }

  const s = raw.settings || {};
  const merge = (a, b) => ({ ...(a || {}), ...Object.fromEntries(Object.entries(b || {}).filter(([, v]) => v !== '' && v != null)) });
  const now = Date.now();
  const data = {
    source,
    games: (raw.games || []).map((g) => ({ ...g, tags: g.tags || [] })),
    streams: (raw.streams || [])
      .filter((x) => x.is_published !== false)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at)),
    schedule: (raw.schedule || [])
      .filter((e) => new Date(e.starts_at).getTime() > now - 3 * 3600 * 1000)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    posts: (raw.posts || [])
      .filter((p) => p.is_published !== false)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at)),
    achievements: raw.achievements || [],
    sponsors: (raw.sponsors || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    settings: {
      profile: merge(cfg.profile, s.profile),
      links: merge(cfg.links, s.links),
      support: Array.isArray(s.support) && s.support.length ? s.support : cfg.support || [],
      setup: Array.isArray(s.setup) && s.setup.length ? s.setup : cfg.setup || [],
      live: s.live || { is_live: false }
    }
  };
  return data;
}
