import { t } from '../lib/ctx.js';

function human(ms) {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

export default function init() {
  const items = [...document.querySelectorAll('.schedule-item[data-start]')];
  const tick = () => {
    const now = Date.now();
    for (const it of items) {
      const start = new Date(it.dataset.start).getTime();
      const out = it.querySelector('[data-countdown]');
      if (!out) continue;
      const diff = start - now;
      it.classList.toggle('is-past', diff < -3 * 3600 * 1000);
      out.textContent = diff > 60000 ? t('schedule.in', { t: human(diff) }) : diff > -3 * 3600 * 1000 ? t('schedule.live_soon') : t('schedule.past');
    }
  };
  tick();
  setInterval(tick, 30000);
  document.addEventListener('gamepov:lang', tick);
}
