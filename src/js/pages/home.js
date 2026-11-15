// Hide upcoming rows that have already finished since the site was built.
export default function init() {
  const cutoff = Date.now() - 3 * 3600 * 1000;
  for (const row of document.querySelectorAll('.upcoming-row[data-start]')) {
    if (new Date(row.dataset.start).getTime() < cutoff) row.hidden = true;
  }
}
