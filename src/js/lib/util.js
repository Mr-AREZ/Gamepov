// Shared helpers — used both by the Node build script and by the browser.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** ASCII-only URL slug. Falls back to a random suffix when nothing is left. */
export function slugify(s) {
  const out = String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return out || 'item-' + Date.now().toString(36);
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** ISO-8601 duration for schema.org, e.g. PT1H2M3S */
export function isoDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}${s || (!h && !m) ? s + 'S' : ''}`;
}

export function formatDate(iso, lang = 'en', opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const locale = lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(iso, lang = 'en') {
  return formatDate(iso, lang, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(ref) {
  ref = String(ref || '').trim();
  if (YT_ID.test(ref)) return ref;
  try {
    const u = new URL(ref);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|live|shorts|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch { /* not a URL */ }
  return null;
}

export function parseTwitch(ref) {
  ref = String(ref || '').trim();
  if (/^\d+$/.test(ref)) return { kind: 'video', id: ref };
  try {
    const u = new URL(ref);
    let m = u.pathname.match(/\/videos\/(\d+)/);
    if (m) return { kind: 'video', id: m[1] };
    if (u.hostname === 'clips.twitch.tv') {
      const slug = u.pathname.split('/').filter(Boolean).pop();
      if (slug) return { kind: 'clip', id: slug };
    }
    m = u.pathname.match(/\/clip\/([A-Za-z0-9_-]+)/);
    if (m) return { kind: 'clip', id: m[1] };
  } catch { /* not a URL */ }
  if (/^[A-Za-z0-9_-]{6,}$/.test(ref)) return { kind: 'clip', id: ref };
  return null;
}

/**
 * Turn a stream row into something renderable.
 * Returns { type: 'iframe'|'video'|'none', src, thumb, embedUrl, contentUrl }
 */
export function resolveVideo(stream, { host = 'localhost', mediaUrl = (p) => p } = {}) {
  const ref = stream.video_ref;
  if (stream.source === 'youtube') {
    const id = parseYouTubeId(ref);
    if (!id) return { type: 'none' };
    return {
      type: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`
    };
  }
  if (stream.source === 'twitch') {
    const t = parseTwitch(ref);
    if (!t) return { type: 'none' };
    const parent = encodeURIComponent(host);
    const src =
      t.kind === 'video'
        ? `https://player.twitch.tv/?video=${t.id}&parent=${parent}&autoplay=false`
        : `https://clips.twitch.tv/embed?clip=${encodeURIComponent(t.id)}&parent=${parent}&autoplay=false`;
    return { type: 'iframe', src, embedUrl: src, thumb: '', watchUrl: t.kind === 'video' ? `https://www.twitch.tv/videos/${t.id}` : `https://clips.twitch.tv/${t.id}` };
  }
  if (stream.source === 'upload') {
    const src = /^https?:\/\//.test(ref) ? ref : mediaUrl(ref);
    return { type: 'video', src, contentUrl: src, thumb: '' };
  }
  return { type: 'none' };
}

/** Very small, safe Markdown → HTML (headings, lists, bold/italic, links, paragraphs). */
export function miniMarkdown(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = false;
  let para = [];
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push('</ul>');
    list = false;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = Math.min(m[1].length + 1, 4);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return out.join('\n');
}

export const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function truncate(s, n = 160) {
  s = stripTags(s);
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
