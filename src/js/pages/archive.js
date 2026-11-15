// Client-side filtering, sorting and "load more" for any grid with [data-grid].
export default function init() {
  const bar = document.querySelector('[data-filters]');
  const grid = document.querySelector('[data-grid]');
  if (!bar || !grid) return;
  const cards = [...grid.children];
  const q = bar.querySelector('[data-filter-q]');
  const gameSel = bar.querySelector('[data-filter-game]');
  const kindSel = bar.querySelector('[data-filter-kind]');
  const sortSel = bar.querySelector('[data-filter-sort]');
  const tabs = [...bar.querySelectorAll('[data-tab]')];
  const empty = document.querySelector('[data-empty]');
  const more = document.querySelector('[data-load-more]');
  const pageSize = Number(grid.dataset.pageSize) || 12;
  const fixedGame = bar.dataset.fixedGame || '';
  let shown = pageSize;
  let tabKinds = [];

  const initial = new URLSearchParams(location.search);
  if (q && initial.get('q')) q.value = initial.get('q');
  if (gameSel && initial.get('game')) gameSel.value = initial.get('game');

  function apply() {
    const needle = (q?.value || '').trim().toLowerCase();
    const game = fixedGame || gameSel?.value || '';
    const kind = kindSel?.value || '';
    const dir = sortSel?.value === 'old' ? 1 : -1;
    const sorted = [...cards].sort((a, b) => dir * (Number(a.dataset.ts) - Number(b.dataset.ts)));
    grid.append(...sorted);
    let matched = 0;
    for (const c of sorted) {
      const ok =
        (!needle || c.dataset.q.includes(needle)) &&
        (!game || c.dataset.game === game) &&
        (!kind || c.dataset.kind === kind) &&
        (!tabKinds.length || tabKinds.includes(c.dataset.kind));
      if (ok) matched++;
      c.hidden = !ok || matched > shown;
    }
    if (empty) empty.hidden = matched > 0;
    if (more) more.hidden = matched <= shown;
  }

  const reset = () => { shown = pageSize; apply(); };
  q?.addEventListener('input', reset);
  gameSel?.addEventListener('change', reset);
  kindSel?.addEventListener('change', reset);
  sortSel?.addEventListener('change', reset);
  more?.addEventListener('click', () => { shown += pageSize; apply(); });
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('is-active', x === tab));
      tabKinds = tab.dataset.tab ? tab.dataset.tab.split(',') : [];
      reset();
    });
  }
  apply();
}
