/**
 * citations.js — builds and locates reference-list entries in the editor.
 *
 * The checking engine (engine/src/citation_style.rs, mirrored in
 * src/engine/fallback.js) reads a finished reference list and says what is
 * wrong with it. This file is the other half: it writes entries that already
 * satisfy those rules, and it finds the reference section as real ProseMirror
 * positions so the editor can insert, edit or remove one entry without
 * touching the rest of the document.
 *
 * The two sides must not drift apart silently, so every template here is
 * built from the same examples the engine's own messages quote (see
 * citation_style.rs's `example()` and the Help article "Choosing a citation
 * style"). A change to one belongs with a check of the other.
 */

const REFERENCE_HEADING_NAMES = new Set([
  'references', 'reference', 'reference list', 'bibliography', 'works cited', 'citations', 'sources',
]);

export function isReferenceHeadingText(text) {
  const name = (text || '').toLowerCase().replace(/:+$/, '').trim();
  return REFERENCE_HEADING_NAMES.has(name);
}

/** The heading name a style expects: "Works Cited" for MLA, "References" otherwise. */
export function listNameFor(style) {
  return style === 'MLA' ? 'Works Cited' : 'References';
}

/**
 * The boilerplate shown when the writer picks a standard: what one entry and
 * one in-text citation look like. The wording matches citation_style.rs's own
 * `example()` and the Help article "Choosing a citation style" exactly, so
 * the dialog, the engine's own messages and the Help page never disagree
 * about what "correct APA" looks like.
 */
export const STYLE_OPTIONS = [
  {
    style: 'APA',
    blurb: 'Author-year. Alphabetical list headed “References.”',
    entryExample: 'Author, A. A. (2020). Article title. Journal Name, 3(2), 10-20.',
    inTextExample: '(Author, 2020)',
  },
  {
    style: 'MLA',
    blurb: 'Author-page. Alphabetical list headed “Works Cited.”',
    entryExample: 'Author, Firstname. "Article Title." Journal Name, vol. 3, no. 2, 2020, pp. 10-20.',
    inTextExample: '(Author 12)',
  },
  {
    style: 'IEEE',
    blurb: 'Numbered. Listed in the order each source is first cited.',
    entryExample: '[1] A. Author, "Article title," Journal Name, vol. 3, no. 2, pp. 10-20, 2020.',
    inTextExample: '[1]',
  },
];

/** "John Robert" → "J. R."; "J" → "J."; already-dotted initials are kept as typed. */
export function initialsOf(given) {
  return (given || '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => (part.endsWith('.') ? part : `${part[0].toUpperCase()}.`))
    .join(' ');
}

/** One author, in the order the style writes it. */
function formatAuthor(style, surname, given) {
  const s = surname.trim();
  if (style === 'IEEE') return `${initialsOf(given)} ${s}`.trim();
  if (style === 'MLA') return `${s}, ${given.trim()}`;
  return `${s}, ${initialsOf(given)}`; // APA and the no-style default
}

/** Both authors joined the way the style joins them, or just the first when there is one. */
function formatAuthors(style, source) {
  const first = formatAuthor(style, source.surname, source.given);
  if (!source.surname2?.trim()) return first;
  const second = formatAuthor(style, source.surname2, source.given2);
  if (style === 'IEEE') return `${first} and ${second}`;
  if (style === 'MLA') return `${first}, and ${source.given2.trim()} ${source.surname2.trim()}`;
  return `${first}, & ${second}`; // APA joins with "&", never "and"
}

/**
 * The reference-list entry for one source, in the chosen style. No style
 * chosen falls back to the APA shape — familiar, and unambiguous since no
 * style check runs against it anyway.
 *
 * `number` is the IEEE bracket ("[3] "); APA and MLA ignore it, since those
 * styles are never numbered.
 */
export function formatEntryText(style, source, number) {
  const authors = formatAuthors(style, source);
  const title = source.title.trim();
  const venue = source.venue.trim();
  const vol = source.volume?.trim();
  const issue = source.issue?.trim();
  const pages = source.pages?.trim();
  const year = source.year.trim();

  if (style === 'MLA') {
    const details = [venue, vol ? `vol. ${vol}` : '', issue ? `no. ${issue}` : '', year, pages ? `pp. ${pages}` : '']
      .filter(Boolean)
      .join(', ');
    return `${authors}. “${title}.” ${details}.`;
  }
  if (style === 'IEEE') {
    const numeric = [vol ? `vol. ${vol}` : '', issue ? `no. ${issue}` : '', pages ? `pp. ${pages}` : ''].filter(Boolean);
    // With no volume, issue or pages to give (a website, a report), a link stands in for
    // them — IEEE accepts "Available: …" as the missing detail; nothing at all is a real gap.
    const parts = [venue, ...numeric];
    if (!numeric.length && source.url?.trim()) parts.push(`Available: ${source.url.trim()}`);
    parts.push(year);
    const details = parts.filter(Boolean).join(', ');
    return `[${number}] ${authors}, “${title},” ${details}.`;
  }
  // APA and the no-style default
  const issueVol = vol ? `${vol}${issue ? `(${issue})` : ''}` : '';
  const details = [venue, issueVol, pages].filter(Boolean).join(', ');
  return `${authors} (${year}). ${title}. ${details}.`;
}

/** The in-text citation for one source, in the chosen style. */
export function formatInText(style, cite) {
  const { surname, surname2, year, page, number } = cite;
  if (style === 'IEEE') return `[${number}]`;
  if (style === 'MLA') {
    const who = surname2 ? `${surname} and ${surname2}` : surname;
    return page ? `(${who} ${page})` : `(${who})`;
  }
  // APA and the no-style default
  const who = surname2 ? `${surname} & ${surname2}` : surname;
  return `(${who}, ${year})`;
}

/** Strips a leading "[3] ", "3. " or "3) " marker, if the entry has one. */
function withoutLeadingMarker(text) {
  const bracket = text.match(/^\[(\d+)\]\s*/);
  if (bracket) return { body: text.slice(bracket[0].length), number: Number(bracket[1]) };
  const plain = text.match(/^(\d{1,3})[.)]\s+/);
  if (plain && !/^\d{4}[.)]\s/.test(text)) return { body: text.slice(plain[0].length), number: Number(plain[1]) };
  return { body: text, number: null };
}

/** The name an entry is filed under: the text up to its first comma, period or "(". */
function leadingSurname(body) {
  const cut = body.search(/[,.(]/);
  return (cut < 0 ? body : body.slice(0, cut)).trim();
}

/** The first year (1500-2099) anywhere in the entry, or ''. */
function leadingYear(text) {
  const found = text.match(/\b(\d{4})\b/g);
  const year = (found || []).map(Number).find((n) => n >= 1500 && n <= 2099);
  return year ? String(year) : '';
}

/** What a picker row needs to build an in-text citation for an existing entry. */
function describeEntry(text) {
  const { body, number } = withoutLeadingMarker(text);
  return { surname: leadingSurname(body), year: leadingYear(body), number };
}

/**
 * Finds the reference section in the document, as real editor positions.
 *
 * `doc` is `editor.state.doc` (a ProseMirror node). Returns `null` when the
 * document has no reference-list heading yet. Otherwise:
 *   - `headingEnd` — the position right after the heading, for an empty list
 *   - `sectionEnd` — the position right after the last entry (or the heading,
 *     if the list is empty), which is where a new entry belongs
 *   - `entries` — one non-empty paragraph per entry, each with its own
 *     `{ from, to }` so it can be replaced or removed on its own
 */
export function findReferenceRegion(doc) {
  let phase = 'before'; // before the heading | inside the section | past it
  let region = null;
  doc.forEach((node, offset) => {
    if (phase === 'past') return;
    if (node.type.name === 'heading') {
      if (phase === 'before' && isReferenceHeadingText(node.textContent)) {
        region = { headingEnd: offset + node.nodeSize, sectionEnd: offset + node.nodeSize, entries: [] };
        phase = 'inside';
        return;
      }
      if (phase === 'inside') phase = 'past';
      return;
    }
    if (phase !== 'inside') return;
    region.sectionEnd = offset + node.nodeSize;
    const text = node.textContent.trim();
    if (text) region.entries.push({ from: offset, to: offset + node.nodeSize, text, ...describeEntry(text) });
  });
  return region;
}

/** The next free IEEE number: one past the highest bracket already in the list. */
export function nextIeeeNumber(entries) {
  const used = entries.map((entry) => entry.number).filter((n) => typeof n === 'number');
  return (used.length ? Math.max(...used) : 0) + 1;
}
