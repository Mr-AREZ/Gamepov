import { db, t, onLang } from '../lib/ctx.js';

export default async function init() {
  const guest = document.querySelector('[data-account-guest]');
  const userBox = document.querySelector('[data-account-user]');
  const noBackend = document.querySelector('[data-no-backend]');
  if (!db.configured) { guest.hidden = true; noBackend.hidden = false; return; }

  const bindStatus = (form) => {
    const status = form.querySelector('[data-status]');
    let key = '';
    let raw = '';
    const say = (k, cls = '', text = '') => { key = k; raw = text; status.textContent = text || t(k); status.className = 'form-status ' + cls; };
    onLang(() => { if (key && !raw) status.textContent = t(key); });
    return say;
  };

  async function show() {
    if (!db.user) { guest.hidden = false; userBox.hidden = true; return; }
    guest.hidden = true;
    userBox.hidden = false;
    userBox.querySelector('[data-user-name]').textContent = db.user.user_metadata?.display_name || db.user.email.split('@')[0];
    userBox.querySelector('[data-user-email]').textContent = db.user.email;
    let role = 'viewer';
    try { role = (await db.getProfile())?.role || 'viewer'; } catch { /* ignore */ }
    const chip = userBox.querySelector('[data-user-role]');
    chip.dataset.i18n = role === 'admin' ? 'auth.role_admin' : 'auth.role_viewer';
    chip.textContent = t(chip.dataset.i18n);
    userBox.querySelector('[data-admin-link]').hidden = role !== 'admin';
  }

  const login = document.querySelector('[data-login-form]');
  const signup = document.querySelector('[data-signup-form]');
  const sayLogin = bindStatus(login);
  const saySignup = bindStatus(signup);

  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(login);
    sayLogin('auth.signing_in');
    try {
      await db.signIn(String(f.get('email')).trim(), String(f.get('password')));
      location.reload();
    } catch (err) { sayLogin('auth.error', 'err', err.message); }
  });
  signup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(signup);
    const name = String(f.get('display_name')).trim();
    if (!name || !f.get('email') || String(f.get('password')).length < 6) return saySignup('form.required', 'err');
    saySignup('auth.signing_in');
    try {
      const r = await db.signUp(String(f.get('email')).trim(), String(f.get('password')), name);
      if (r.needsConfirmation) saySignup('auth.check_email', 'ok');
      else location.reload();
    } catch (err) { saySignup('auth.error', 'err', err.message); }
  });
  document.querySelector('[data-logout]').addEventListener('click', async () => { await db.signOut(); location.reload(); });
  await show();
}
