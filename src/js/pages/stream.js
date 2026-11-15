// Stream page: copy link + comments (Supabase).
import { db, t, el, onLang, link } from '../lib/ctx.js';
import { formatDate } from '../lib/util.js';
import { getLang } from '../lib/ctx.js';

function copyLink() {
  const btn = document.querySelector('[data-copy-link]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    try { await navigator.clipboard.writeText(location.href); } catch {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = location.href;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    btn.textContent = t('copy.done');
    setTimeout(() => { btn.textContent = original; }, 1600);
  });
}

async function comments() {
  const sec = document.querySelector('#comments');
  if (!sec) return;
  const streamId = sec.dataset.streamId;
  const formBox = sec.querySelector('[data-comments-form]');
  const list = sec.querySelector('[data-comments-list]');
  if (!db.configured) { sec.hidden = true; return; }

  let isAdmin = false;
  if (db.user) { try { isAdmin = (await db.getProfile())?.role === 'admin'; } catch { /* ignore */ } }

  async function load() {
    list.replaceChildren(el('p', { class: 'muted', text: t('comments.loading') }));
    try {
      const rows = await db.select('comments', { filters: { stream_id: `eq.${streamId}` }, order: 'created_at.asc' });
      list.replaceChildren();
      if (!rows.length) list.append(el('p', { class: 'muted', text: t('comments.none') }));
      for (const c of rows) {
        const canDelete = db.user && (db.user.id === c.user_id || isAdmin);
        list.append(el('article', { class: 'comment' },
          el('header', {}, el('strong', { text: c.author_name }), el('small', { class: 'muted', text: formatDate(c.created_at, getLang(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) })),
          el('p', { text: c.body }),
          canDelete ? el('button', { class: 'link-btn', type: 'button', text: t('comments.delete'), onclick: async () => { try { await db.remove('comments', { id: c.id }); load(); } catch (e) { console.error(e); } } }) : null));
      }
    } catch (e) {
      console.error(e);
      list.replaceChildren(el('p', { class: 'muted', text: t('comments.error') }));
    }
  }

  function renderForm() {
    formBox.replaceChildren();
    if (!db.user) {
      formBox.append(el('p', { class: 'muted' }, el('a', { href: link('account/'), text: t('comments.login') })));
      return;
    }
    const ta = el('textarea', { class: 'input', rows: '3', maxlength: '2000', placeholder: t('comments.ph'), 'aria-label': t('comments.ph') });
    const btn = el('button', { class: 'btn btn-primary', type: 'submit', text: t('comments.post') });
    const form = el('form', { class: 'comment-form' }, ta, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      btn.disabled = true;
      btn.textContent = t('comments.posting');
      try {
        const name = db.user.user_metadata?.display_name || db.user.email.split('@')[0];
        await db.insert('comments', { stream_id: streamId, user_id: db.user.id, author_name: name, body });
        ta.value = '';
        await load();
      } catch (err) {
        console.error(err);
        formBox.append(el('p', { class: 'form-status err', text: t('comments.error') }));
      } finally {
        btn.disabled = false;
        btn.textContent = t('comments.post');
      }
    });
    formBox.append(form);
  }

  renderForm();
  await load();
  onLang(() => { renderForm(); load(); });
}

export default async function init() {
  copyLink();
  await comments();
}
