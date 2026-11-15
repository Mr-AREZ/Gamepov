import { db, t, onLang } from '../lib/ctx.js';

export default function init() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const status = form.querySelector('[data-status]');
  let lastKey = '';
  const say = (key, cls = '') => { lastKey = key; status.textContent = t(key); status.className = 'form-status ' + cls; };
  onLang(() => { if (lastKey) status.textContent = t(lastKey); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get('website')) return say('form.sent', 'ok'); // honeypot: pretend success
    const row = { name: String(f.get('name') || '').trim(), email: String(f.get('email') || '').trim(), subject: String(f.get('subject') || '').trim() || null, body: String(f.get('body') || '').trim() };
    if (!row.name || !row.email || !row.body || !/^\S+@\S+\.\S+$/.test(row.email)) return say('form.required', 'err');
    if (!db.configured) return say('account.no_backend', 'err');
    say('form.sending');
    try {
      await db.insert('messages', row, { minimal: true });
      form.reset();
      say('form.sent', 'ok');
    } catch (err) {
      console.error(err);
      say('form.error', 'err');
    }
  });
}
