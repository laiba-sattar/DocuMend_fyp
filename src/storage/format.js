/**
 * format.js — small display helpers for stored timestamps.
 */

/** "today, 9:42 am" · "yesterday, 4:18 pm" · "jun 14, 2026" */
export function formatModified(ms) {
  const date = new Date(ms);
  const now = new Date();
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (daysAgo === 0) return `today, ${time}`;
  if (daysAgo === 1) return `yesterday, ${time}`;
  return date
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    .toLowerCase();
}

/** "1 page" · "12 pages" */
export function pageLabel(count) {
  const n = Math.max(1, count || 1);
  return `${n} ${n === 1 ? 'page' : 'pages'}`;
}

/** About 500 words to a printed page. */
export function pagesFor(wordCount) {
  return Math.max(1, Math.ceil((wordCount || 0) / 500));
}

/** "07:42:05" — the time format FR-03-02-03 asks for. */
export function clockTime(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

/** Words in a block of plain text. */
export function countWords(text) {
  const words = (text || '').trim().match(/\S+/g);
  return words ? words.length : 0;
}
