/**
 * fallback.js — the same checks as the Rust engine, written in JavaScript.
 *
 * The real engine is Rust compiled to WebAssembly (see /engine). This file is
 * the safety net: it runs when the .wasm file has not been built yet, or if the
 * browser refuses to load it. It finds the same kinds of problems, a little
 * more simply, so the editor is never left without an analyser.
 *
 * The report has exactly the shape the Rust engine returns, so nothing else in
 * the app needs to know which one answered.
 */

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'along', 'also', 'although', 'always', 'among', 'another',
  'around', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'cannot', 'could',
  'does', 'doing', 'down', 'during', 'each', 'either', 'else', 'even', 'ever', 'every', 'from',
  'further', 'have', 'having', 'here', 'however', 'into', 'just', 'like', 'made', 'make', 'many',
  'more', 'most', 'much', 'must', 'near', 'need', 'next', 'once', 'only', 'other', 'over', 'part',
  'same', 'shall', 'should', 'since', 'some', 'such', 'than', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'thus', 'under', 'until', 'upon', 'used',
  'using', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'within',
  'without', 'would', 'your',
]);

const NEGATIONS = new Set([
  'not', 'never', 'no', 'none', 'cannot', 'cant', 'dont', 'doesnt', 'didnt', 'wont', 'isnt',
  'arent', 'wasnt', 'werent', 'without', 'neither', 'nor', 'fails', 'failed', 'unable',
]);

const CURRENCIES = {
  pkr: 'PKR', rs: 'PKR', rupees: 'PKR', rupee: 'PKR', '₨': 'PKR',
  usd: 'USD', $: 'USD', dollars: 'USD', dollar: 'USD',
  eur: 'EUR', '€': 'EUR', euros: 'EUR', euro: 'EUR',
  gbp: 'GBP', '£': 'GBP', pounds: 'GBP', pound: 'GBP',
};

const MULTIPLIERS = {
  hundred: 100, thousand: 1e3, k: 1e3, lakh: 1e5, million: 1e6, m: 1e6, mn: 1e6,
  crore: 1e7, billion: 1e9, bn: 1e9,
};

const NOT_UNITS = new Set(['and', 'are', 'but', 'for', 'in', 'is', 'of', 'on', 'or', 'per', 'than', 'the', 'to', 'was', 'were', 'with']);

const MAX_SENTENCES = 600;
const MAX_ISSUES = 60;

/** Splits text into sentences, keeping each one's offset in the text. */
export function splitSentences(text) {
  const sentences = [];
  let begin = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (!'.!?\n۔؟'.includes(c)) continue;
    const isDecimal = c === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '');
    if (isDecimal) continue;
    if (c === '.' && isAbbreviation(text, i)) continue;
    push(text, begin, i + 1, sentences);
    begin = i + 1;
  }
  push(text, begin, text.length, sentences);
  return sentences;
}

/**
 * The full stop at `index` belongs to a short abbreviation ("e.g.", "U.S.").
 * The same rule as engine/src/text.rs: one or two letters before the dot, and
 * either a single letter or a non-space character after it.
 */
function isAbbreviation(text, index) {
  if (index === 0 || !/\p{Alphabetic}/u.test(text[index - 1])) return false;
  let wordLength = 0;
  for (let k = index - 1; k >= 0 && /\p{Alphabetic}/u.test(text[k]); k -= 1) wordLength += 1;
  const next = text[index + 1];
  return wordLength <= 2 && next !== undefined && (next !== ' ' || wordLength === 1);
}

function push(text, begin, end, out) {
  let first = begin;
  let last = end;
  while (first < last && /\s/.test(text[first])) first += 1;
  while (last > first && /\s/.test(text[last - 1])) last -= 1;
  const body = text.slice(first, last);
  if (/[\p{L}\p{N}]/u.test(body)) out.push({ index: out.length, text: body, start: first, end: last });
}

const wordsOf = (text) => (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).map((w) => w.replace(/'/g, ''));

/** The words worth comparing: four letters or more, no numbers, no stopwords. */
export function contentWords(text) {
  return [...new Set(wordsOf(text).filter((w) => w.length >= 4 && /^[\p{L}]+$/u.test(w) && !STOPWORDS.has(w)))].sort();
}

const negationOf = (text) => wordsOf(text).find((w) => NEGATIONS.has(w)) || null;
const sharedWords = (a, b) => a.filter((w) => b.includes(w));

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const shared = sharedWords(a, b).length;
  const union = a.length + b.length - shared;
  return union ? shared / union : 0;
}

const singular = (word) => {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) return lower.slice(0, -1);
  return lower;
};

/** Every number in one sentence, with its unit and its offset in the document. */
export function numbersIn(sentence) {
  const facts = [];
  const body = sentence.text;
  const spans = citationSpans(body);
  let i = 0;
  while (i < body.length) {
    // The digits of a citation like [3] or [2, 4] are reference numbers, not figures.
    const inCitation = spans.find(([from, to]) => i >= from && i < to);
    if (inCitation) {
      i = inCitation[1];
      continue;
    }
    if (!isDigit(body[i])) {
      i += 1;
      continue;
    }
    // Digits, with a comma or a dot only when a digit follows it (45,000 or 3.5),
    // the same way engine/src/numbers.rs reads them.
    const digitsStart = i;
    let digitsEnd = i;
    while (digitsEnd < body.length) {
      const c = body[digitsEnd];
      if (isDigit(c) || ((c === ',' || c === '.') && isDigit(body[digitsEnd + 1]))) digitsEnd += 1;
      else break;
    }
    let value = Number(body.slice(digitsStart, digitsEnd).replace(/,/g, ''));
    if (Number.isNaN(value)) {
      i = digitsEnd;
      continue;
    }
    let unit = '';
    let start = digitsStart;
    let end = digitsEnd;

    const before = body.slice(0, start).match(/([\p{L}$€£₨]+)\.?\s*$/u);
    if (before) {
      const code = CURRENCIES[before[1].toLowerCase()];
      if (code) {
        unit = code;
        start -= before[0].length;
      }
    }

    const after = body.slice(end).match(/^\s*(%|[\p{L}]+)/u);
    if (after) {
      const word = after[1].toLowerCase();
      if (word === '%' || word === 'percent' || word === 'percentage') {
        unit = '%';
        end += after[0].length;
      } else if (MULTIPLIERS[word]) {
        value *= MULTIPLIERS[word];
        end += after[0].length;
        const next = body.slice(end).match(/^\s*([\p{L}]+)/u);
        if (next && !unit) {
          const nextWord = next[1].toLowerCase();
          if (CURRENCIES[nextWord]) { unit = CURRENCIES[nextWord]; end += next[0].length; }
          else if (isUnitWord(nextWord)) { unit = singular(nextWord); end += next[0].length; }
        }
      } else if (!unit && CURRENCIES[word]) {
        unit = CURRENCIES[word];
        end += after[0].length;
      } else if (!unit && isUnitWord(word)) {
        unit = singular(word);
        end += after[0].length;
      }
    }

    facts.push({
      value,
      unit,
      raw: body.slice(start, end).trim(),
      start: sentence.start + start,
      end: sentence.start + end,
    });
    i = Math.max(end, digitsEnd);
  }
  return facts;
}

/** Where the numbered citations ("[3]", "[2, 4]", "[3-6]") sit in a piece of text, as [from, to) pairs. */
function citationSpans(text) {
  const spans = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '[') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < text.length && j - i <= 40 && (isDigit(text[j]) || text[j] === ' ' || text[j] === ',' || text[j] === '-' || text[j] === '–')) j += 1;
    if (j < text.length && text[j] === ']' && j > i + 1 && /\d/.test(text.slice(i + 1, j))) {
      spans.push([i, j + 1]);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

const isUnitWord = (word) => word.length >= 2 && /^[\p{L}]+$/u.test(word) && !NOT_UNITS.has(word);


/* ---------------------------------------------------------------------------
   Structure checks — the same rules as engine/src/structure.rs
   ------------------------------------------------------------------------- */

/**
 * The sections each kind of document usually has — the same list, in the same
 * order, as THESIS/RESEARCH_PAPER/REPORT/LEGAL in engine/src/structure.rs.
 *
 * Exported because the Settings page shows these to the reader. Showing them
 * from here rather than retyping them means the page can never drift away from
 * what the engine actually looks for.
 */
export const TEMPLATES = {
  thesis: [
    ['Abstract', ['abstract', 'summary']],
    ['Introduction', ['introduction', 'overview']],
    ['Literature Review', ['literature', 'related work', 'background']],
    ['Methodology', ['methodology', 'method', 'methods', 'approach']],
    ['Results', ['result', 'results', 'findings', 'evaluation']],
    ['Discussion', ['discussion', 'analysis']],
    ['Conclusion', ['conclusion', 'conclusions']],
    ['References', ['reference', 'references', 'bibliography']],
  ],
  'research paper': [
    ['Abstract', ['abstract', 'summary']],
    ['Introduction', ['introduction']],
    ['Related Work', ['related work', 'literature', 'background']],
    ['Method', ['method', 'methods', 'methodology', 'approach']],
    ['Results', ['result', 'results', 'experiment', 'evaluation']],
    ['Discussion', ['discussion', 'analysis']],
    ['Conclusion', ['conclusion', 'conclusions']],
    ['References', ['reference', 'references', 'bibliography']],
  ],
  report: [
    ['Introduction', ['introduction', 'overview', 'purpose']],
    ['Background', ['background', 'context']],
    ['Findings', ['finding', 'findings', 'result', 'results', 'analysis']],
    ['Recommendations', ['recommendation', 'recommendations', 'next steps']],
    ['Conclusion', ['conclusion', 'conclusions', 'summary']],
  ],
  legal: [
    ['Parties', ['parties', 'party', 'between']],
    ['Definitions', ['definition', 'definitions', 'interpretation']],
    ['Scope', ['scope', 'services', 'purpose']],
    ['Obligations', ['obligation', 'obligations', 'responsibilities', 'duties']],
    ['Termination', ['termination', 'term']],
    ['Governing Law', ['governing law', 'jurisdiction', 'dispute']],
  ],
};

/** Reads the outline the editor sends: `level<TAB>start<TAB>end<TAB>title` per line. */
export function parseOutline(raw) {
  return (raw || '')
    .split('\n')
    .map((line) => {
      const [level, start, end, ...rest] = line.split('\t');
      const heading = {
        level: Math.min(6, Math.max(1, Number(level) || 1)),
        start: Number(start),
        end: Number(end),
        title: (rest.join('\t') || '').trim(),
      };
      return Number.isFinite(heading.start) && heading.end > heading.start ? heading : null;
    })
    .filter(Boolean);
}

const mentions = (title, keywords) => keywords.some((word) => title.toLowerCase().includes(word));

/** The "3." or "4.1 " a heading starts with, so renaming keeps the numbering. */
function numberingPrefix(title) {
  const prefix = (title.match(/^[\d.\s)]+/) || [''])[0];
  return /\d/.test(prefix) ? `${prefix.trimEnd()} ` : '';
}

/**
 * The end of the first word, so the "no headings" card has somewhere to point.
 * A zero-width highlight draws as an empty box, which looks like a bug.
 */
function firstWordEnd(text) {
  const match = (text || '').match(/^\s*\S+/);
  return Math.min(40, match ? match[0].length : 0);
}

function structureIssues(text, headings, kind) {
  const issues = [];

  // 0. No headings at all.
  //
  // This used to return nothing, which was exactly backwards: a page with no
  // headings is the moment a writer most needs the shape of the document
  // spelled out, and every check below needs at least one heading before it
  // can say anything. So the one thing worth saying here is the whole outline,
  // offered in a single click rather than eight. It waits for 40 words first —
  // nagging an empty page the moment it opens would be noise, not help.
  if (!headings.length) {
    const template = TEMPLATES[(kind || '').trim().toLowerCase()] ?? [];
    const words = (text || '').split(/\s+/).filter(Boolean).length;
    if (template.length && words >= 40) {
      const names = template.map(([name]) => name);
      issues.push({
        id: 'outline-missing',
        kind: 'structure',
        title: 'No headings yet',
        message: `This document has no headings, so nothing about its structure can be checked. `
          + `A ${(kind || 'document').toLowerCase()} usually has ${names.length} sections: ${names.join(', ')}.`,
        severity: 'medium',
        location: 'Whole document',
        start: 0,
        end: firstWordEnd(text),
        related: [],
        repairs: [],
        suggestion: null,
        outline: names.map((name) => ({ title: name, level: 1 })),
      });
    }
    return issues;
  }

  const last = headings[headings.length - 1];
  const bodyLevel = Math.min(3, Math.max(...headings.map((h) => h.level)));
  const template = TEMPLATES[(kind || '').trim().toLowerCase()] ?? [];

  // 1. Sections this kind of document usually has.
  if (headings.length >= 2) {
    template.forEach(([name, keywords]) => {
      // A heading may use a different word for the same section
      // (“Findings” for Results, “Summary” for Abstract).
      const found = headings.find((heading) => mentions(heading.title, keywords));
      if (found) {
        if (!found.title.toLowerCase().includes(name.toLowerCase())) {
          issues.push({
            id: `rename-${found.start}`,
            kind: 'structure',
            title: 'A more standard name',
            message: `\u201c${found.title}\u201d is where a ${(kind || 'document').toLowerCase()} usually puts \u201c${name}\u201d. Renaming it keeps the outline standard.`,
            severity: 'low',
            location: `Heading \u201c${found.title}\u201d`,
            start: found.start,
            end: found.end,
            related: [],
            repairs: [{
              label: `Rename to \u201c${name}\u201d`,
              start: found.start,
              end: found.end,
              text: `${numberingPrefix(found.title)}${name}`,
            }],
            suggestion: null,
            outline: [],
          });
        }
        return;
      }
      issues.push({
        id: `missing-${name.toLowerCase().replace(/ /g, '-')}`,
        kind: 'structure',
        title: `\u201c${name}\u201d section is missing`,
        message: `A ${(kind || 'document').toLowerCase()} usually includes \u201c${name}\u201d. This document has no heading for it.`,
        severity: 'medium',
        location: `${headings.length} headings so far`,
        start: last.start,
        end: last.end,
        related: [],
        repairs: [],
        suggestion: { title: name, level: Math.max(1, bodyLevel) },
        outline: [],
      });
    });
  }

  // 2. Headings with nothing written under them.
  headings.forEach((heading, index) => {
    const next = headings[index + 1];
    const body = text.slice(heading.end, next ? next.start : text.length);
    if (body.trim()) return;
    if (next && next.level > heading.level) return;   // a parent heading, not an empty section
    issues.push({
      id: `empty-${heading.start}`,
      kind: 'structure',
      title: 'Section has no text',
      message: `\u201c${heading.title}\u201d has a heading but nothing written under it yet.`,
      severity: 'low',
      location: `Heading \u201c${heading.title}\u201d`,
      start: heading.start,
      end: heading.end,
      related: [],
      repairs: [],
      suggestion: null,
      outline: [],
    });
  });

  // 3. A heading level that jumps (Heading 1 straight to Heading 3).
  headings.forEach((after, index) => {
    const before = headings[index - 1];
    if (!before || after.level <= before.level + 1) return;
    issues.push({
      id: `level-${after.start}`,
      kind: 'structure',
      title: 'Heading level skipped',
      message: `\u201c${after.title}\u201d is a Heading ${after.level} directly under a Heading ${before.level}. Use Heading ${before.level + 1} so the outline stays in order.`,
      severity: 'low',
      location: `Heading \u201c${after.title}\u201d`,
      start: after.start,
      end: after.end,
      related: [{ start: before.start, end: before.end }],
      repairs: [],
      suggestion: null,
      outline: [],
    });
  });

  // 4. The same heading twice.
  headings.forEach((heading, index) => {
    if (!heading.title.trim()) return;
    const earlier = headings
      .slice(0, index)
      .find((other) => other.title.trim().toLowerCase() === heading.title.trim().toLowerCase());
    if (!earlier) return;
    issues.push({
      id: `duplicate-${heading.start}`,
      kind: 'structure',
      title: 'Two sections share a name',
      message: `\u201c${heading.title}\u201d is used as a heading twice. Rename one of them.`,
      severity: 'low',
      location: `Heading \u201c${heading.title}\u201d`,
      start: heading.start,
      end: heading.end,
      related: [{ start: earlier.start, end: earlier.end }],
      repairs: [],
      suggestion: null,
      outline: [],
    });
  });

  return issues;
}

/* ---------------------------------------------------------------------------
   Numbering and references — the same rules as engine/src/numbering.rs and
   engine/src/references.rs. Keep the two in step: `npm run test:engine`
   compares them.
   ------------------------------------------------------------------------- */

/** The document's non-empty lines, trimmed, with their offsets in the text. */
function documentLines(text) {
  const out = [];
  let position = 0;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed) {
      const lead = raw.length - raw.trimStart().length;
      out.push({ start: position + lead, end: position + lead + trimmed.length, text: trimmed });
    }
    position += raw.length + 1;
  }
  return out;
}

const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
const pathString = (path) => path.join('.');

/** "3. Results" is [3]; "2.1 Background" is [2, 1]. At most three digits per part. */
export function headingNumber(title) {
  const path = [];
  let i = 0;
  for (;;) {
    const begin = i;
    while (i < title.length && isDigit(title[i])) i += 1;
    if (i === begin || i - begin > 3) return null;
    path.push(Number(title.slice(begin, i)));
    if (i + 1 < title.length && title[i] === '.' && isDigit(title[i + 1])) {
      i += 1;
      continue;
    }
    break;
  }
  const end = i;
  let j = i;
  if (j < title.length && (title[j] === '.' || title[j] === ')')) j += 1;
  if (j >= title.length || !/\s/.test(title[j])) return null;
  if (/^\s*$/.test(title.slice(j))) return null;
  return { path, end };
}

/** The heading without its number: "3. Results" is "Results". */
export function headingText(title) {
  const number = headingNumber(title);
  if (!number) return title.trim();
  let j = number.end;
  if (j < title.length && (title[j] === '.' || title[j] === ')')) j += 1;
  return title.slice(j).trim();
}

/** The number that starts a typed list item: "3. x", "3) x" or "[3] x". */
function marker(line) {
  const bracket = line[0] === '[';
  const digitsStart = bracket ? 1 : 0;
  let i = digitsStart;
  while (i < line.length && isDigit(line[i])) i += 1;
  const digitsLen = i - digitsStart;
  if (digitsLen === 0 || digitsLen > 3) return null;
  const number = Number(line.slice(digitsStart, i));
  if (number === 0) return null;
  let style;
  if (bracket && line[i] === ']') style = ']';
  else if (!bracket && line[i] === '.') style = '.';
  else if (!bracket && line[i] === ')') style = ')';
  else return null;
  const tokenEnd = i + 1;
  if (tokenEnd >= line.length || !/\s/.test(line[tokenEnd])) return null;
  return { number, digitsStart, digitsLen, tokenEnd, style };
}

const MAX_SEQUENCE_ISSUES = 40;

function numberingIssues(headings, lines) {
  const issues = [];
  const build = (start, end, message, location, related, repair) => ({
    id: `numbering-${start}`,
    kind: 'structure',
    title: 'Numbering has a gap',
    message,
    severity: 'low',
    location,
    start,
    end,
    related: [related],
    repairs: [repair],
    suggestion: null,
    outline: [],
  });

  // numbered headings: compare each with the one before it at its level
  const numbered = [];
  headings.forEach((heading, index) => {
    const number = headingNumber(heading.title);
    if (number) numbered.push({ index, number });
  });
  for (let k = 0; k < numbered.length; k += 1) {
    if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
    const { index, number: current } = numbered[k];
    const depth = current.path.length;
    const parent = current.path.slice(0, depth - 1).join(',');
    let before = null;
    for (let m = k - 1; m >= 0; m -= 1) {
      const other = numbered[m].number;
      if (other.path.length === depth && other.path.slice(0, depth - 1).join(',') === parent) {
        before = numbered[m];
        break;
      }
    }
    if (!before) continue;
    const previous = before.number;
    const a = previous.path[depth - 1];
    const b = current.path[depth - 1];
    if (b === a + 1 || (depth === 1 && b === 1)) continue;
    const heading = headings[index];
    const expected = [...current.path];
    expected[depth - 1] = a + 1;
    const cur = pathString(current.path);
    const prev = pathString(previous.path);
    let message;
    if (b === a) {
      message = `Two sections are both numbered ${cur}.`;
    } else if (b < a) {
      message = `“${heading.title}” is numbered ${cur}, which comes before the section above it, ${prev}.`;
    } else {
      const first = [...current.path];
      first[depth - 1] = a + 1;
      const last = [...current.path];
      last[depth - 1] = b - 1;
      const missing = a + 1 === b - 1
        ? `Section ${pathString(first)} is missing.`
        : `Sections ${pathString(first)} to ${pathString(last)} are missing.`;
      message = `“${heading.title}” is numbered ${cur}, but the section before it is ${prev}. ${missing}`;
    }
    const earlier = headings[before.index];
    issues.push(build(
      heading.start,
      heading.start + current.end,
      message,
      `Heading “${heading.title}”`,
      { start: earlier.start, end: earlier.start + previous.end },
      { label: `Number it ${pathString(expected)}`, start: heading.start, end: heading.start + current.end, text: pathString(expected) },
    ));
  }

  // typed lists: consecutive lines that start with 1. 2. 3.
  let earlier = null; // { mark, lineStart }
  for (const line of lines) {
    if (headings.some((h) => h.start === line.start)) {
      earlier = null;
      continue;
    }
    const now = marker(line.text);
    if (!now) {
      earlier = null;
      continue;
    }
    if (earlier && earlier.mark.style === now.style) {
      const a = earlier.mark.number;
      const b = now.number;
      if (b !== a + 1 && b !== 1) {
        if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
        let message;
        if (b === a) message = `Two items in a row are both numbered ${b}.`;
        else if (b < a) message = `The numbering goes back from ${a} to ${b}.`;
        else if (a + 1 === b - 1) message = `The list goes from ${a} to ${b}. Item ${a + 1} is missing.`;
        else message = `The list goes from ${a} to ${b}. Items ${a + 1} to ${b - 1} are missing.`;
        const digits = line.start + now.digitsStart;
        issues.push(build(
          digits,
          line.start + now.tokenEnd,
          message,
          `Items ${a} and ${b}`,
          { start: earlier.lineStart + earlier.mark.digitsStart, end: earlier.lineStart + earlier.mark.tokenEnd },
          { label: `Number it ${a + 1}`, start: digits, end: digits + now.digitsLen, text: String(a + 1) },
        ));
      }
    }
    earlier = { mark: now, lineStart: line.start };
  }
  return issues;
}

const REFERENCE_HEADINGS = ['references', 'reference', 'reference list', 'bibliography', 'works cited', 'citations', 'sources'];
const isReferencesHeading = (title) => REFERENCE_HEADINGS.includes(headingText(title).toLowerCase().replace(/:+$/, '').trim());

/** A year from 1500 to 2099, or "n.d." (no date)? */
function hasYear(text) {
  if (text.toLowerCase().includes('n.d.')) return true;
  const runs = /\d+/g;
  let found = runs.exec(text);
  while (found) {
    if (found[0].length === 4 && (found.index === 0 || !/[\p{L}\p{N}]/u.test(text[found.index - 1]))) {
      const value = Number(found[0]);
      if (value >= 1500 && value <= 2099) return true;
    }
    found = runs.exec(text);
  }
  return false;
}

/** "2, 4" is 2 and 4; "3-6" is 3, 4, 5, 6. Anything else is ignored. */
function expandCitation(inner) {
  const out = [];
  const parse = (s) => (/^\d+$/.test(s) ? Number(s) : null);
  for (const part of inner.split(',')) {
    const pieces = part.trim().split(/[-–]/).map((s) => s.trim());
    if (pieces.length === 1) {
      const n = parse(pieces[0]);
      if (n !== null && n >= 1 && n <= 999) out.push(n);
    } else if (pieces.length === 2) {
      const a = parse(pieces[0]);
      const b = parse(pieces[1]);
      if (a !== null && b !== null && a >= 1 && b >= a && b <= 999 && b - a <= 100) {
        for (let n = a; n <= b; n += 1) out.push(n);
      }
    }
  }
  return out;
}

/** Every "[5]"-style citation on one line. */
function citationsIn(line) {
  const found = [];
  const s = line.text;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '[') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < s.length && j - i <= 40 && (isDigit(s[j]) || s[j] === ' ' || s[j] === ',' || s[j] === '-' || s[j] === '–')) j += 1;
    if (j < s.length && s[j] === ']' && j > i + 1) {
      const inner = s.slice(i + 1, j);
      if (/\d/.test(inner)) {
        for (const number of expandCitation(inner)) found.push({ number, start: line.start + i, end: line.start + j + 1 });
        i = j + 1;
        continue;
      }
    }
    i += 1;
  }
  return found;
}

/** Makes a "citation" issue. */
function citationIssue(id, title, message, severity, location, start, end) {
  return {
    id, kind: 'citation', title, message, severity, location, start, end,
    related: [], repairs: [], suggestion: null, outline: [],
  };
}

/** The reference list: its heading, where it starts and ends, and one entry per line. */
function findReferenceList(documentLength, headings, lines) {
  const position = headings.findIndex((h) => isReferencesHeading(h.title));
  if (position < 0) return null;
  const start = headings[position].end;
  const end = headings[position + 1] ? headings[position + 1].start : documentLength;
  const contains = (line) => line.start >= start && line.start < end;
  const isHeading = (line) => headings.some((h) => h.start === line.start);
  const entries = lines
    .filter((line) => contains(line) && !isHeading(line))
    .map((line) => ({ line, mark: marker(line.text) }));
  return { heading: headings[position], contains, isHeading, entries };
}

/** Every numbered citation in the text outside the reference list, in reading order. */
function bodyCitations(list, lines) {
  return lines.filter((line) => !list.contains(line) && !list.isHeading(line)).flatMap(citationsIn);
}

function referenceIssues(documentLength, headings, lines) {
  const issues = [];
  const list = findReferenceList(documentLength, headings, lines);
  if (!list) return issues;
  const { entries } = list;

  // 1. a reference with no year
  for (const { line, mark } of entries) {
    if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
    if (line.text.split(/\s+/).filter(Boolean).length < 3 || hasYear(line.text)) continue;
    issues.push(citationIssue(
      `reference-year-${line.start}`,
      'Reference has no year',
      'This reference does not give a year, so a reader cannot tell which edition or date it means.',
      'medium',
      mark ? `Reference ${mark.number}` : 'Reference list',
      line.start,
      line.end,
    ));
  }

  const listed = entries.filter((e) => e.mark).map((e) => ({ number: e.mark.number, line: e.line, mark: e.mark }));
  if (!listed.length) return issues;
  const cited = bodyCitations(list, lines);

  // 2. a citation with no matching reference
  const reported = [];
  for (const citation of cited) {
    if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
    if (listed.some((e) => e.number === citation.number) || reported.includes(citation.number)) continue;
    reported.push(citation.number);
    issues.push(citationIssue(
      `citation-missing-${citation.start}`,
      'Citation has no matching reference',
      `Citation [${citation.number}] points at a reference that is not in the list.`,
      'medium',
      `Citation [${citation.number}]`,
      citation.start,
      citation.end,
    ));
  }

  // 3. a numbered reference that nothing cites
  if (cited.length) {
    for (const entry of listed) {
      if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
      if (cited.some((c) => c.number === entry.number)) continue;
      issues.push(citationIssue(
        `reference-uncited-${entry.line.start}`,
        'Reference is never cited',
        `Reference [${entry.number}] is not cited anywhere in the text.`,
        'low',
        `Reference ${entry.number}`,
        entry.line.start,
        entry.line.start + entry.mark.tokenEnd,
      ));
    }
  }
  return issues;
}

/* ---------------------------------------------------------------------------
   Citation style — the same rules as engine/src/citation_style.rs. The writer
   picks APA, MLA or IEEE; the reference list is then read the way that style
   expects it. Keep the two in step: `npm run test:engine` compares them.
   ------------------------------------------------------------------------- */

const STYLE_NAMES = { apa: 'APA', mla: 'MLA', ieee: 'IEEE' };
const STYLE_INFO = {
  APA: { listName: 'References', example: 'Author, A. A. (2020). Article title. Journal Name, 3(2), 10-20.' },
  MLA: { listName: 'Works Cited', example: 'Author, Firstname. "Article Title." Journal Name, vol. 3, no. 2, 2020, pp. 10-20.' },
  IEEE: { listName: 'References', example: '[1] A. Author, "Article title," Journal Name, vol. 3, no. 2, pp. 10-20, 2020.' },
};

/** "APA", "mla" or " IEEE " (any case) becomes the style's name; anything else is no style. */
function parseStyle(name) {
  return STYLE_NAMES[String(name || '').trim().toLowerCase()] || null;
}

const isUpper = (c) => c !== undefined && /^\p{Uppercase}$/u.test(c);
const isAlpha = (c) => c !== undefined && /^\p{Alphabetic}$/u.test(c);
const isAlnum = (c) => c !== undefined && /^[\p{Alphabetic}\p{N}]$/u.test(c);
const isSpace = (c) => c !== undefined && /^\p{White_Space}$/u.test(c);
const startsUpper = (word) => word.length > 0 && isUpper(String.fromCodePoint(word.codePointAt(0)));
const splitWords = (text) => text.split(/\p{White_Space}+/u).filter(Boolean);
const NAME_PUNCTUATION = new Set(["'", '’', '-', ' ']);

/** Ends with a full stop, or with a link or DOI (which take none). */
function endsProperly(text) {
  const trimmed = text.trimEnd();
  if (trimmed.endsWith('.')) return true;
  const last = splitWords(trimmed).pop() || '';
  return last.includes('://') || last.toLowerCase().startsWith('doi');
}

/** "A. Author" or "J. K. Rowling": initials first, then the surname. */
function initialsFirst(text) {
  const chars = Array.from(text);
  let i = 0;
  let initials = 0;
  while (i + 1 < chars.length && isUpper(chars[i]) && chars[i + 1] === '.') {
    initials += 1;
    i += 2;
    while (i < chars.length && chars[i] === ' ') i += 1;
  }
  return initials >= 1 && i < chars.length && isUpper(chars[i]);
}

/** "Smith, J." (APA: initials only) or "Smith, John" (MLA): surname, comma, first name. */
function surnameFirst(text, initialsOnly) {
  const chars = Array.from(text);
  if (!isUpper(chars[0])) return false;
  let i = 0;
  while (i < chars.length && (isAlpha(chars[i]) || NAME_PUNCTUATION.has(chars[i]))) i += 1;
  if (chars[i] !== ',' || chars[i + 1] !== ' ') return false;
  const name = i + 2;
  if (!isUpper(chars[name])) return false;
  return !initialsOnly || chars[name + 1] === '.';
}

/** No comma before the first sentence: an organisation or a title standing in for an author. */
function organisationOrTitleFirst(text) {
  const at = text.indexOf('. ');
  const head = at >= 0 ? text.slice(0, at) : text;
  return !head.includes(',');
}

/** A title inside quotation marks, straight or curly. */
function hasQuotedTitle(text) {
  const chars = Array.from(text);
  const open = chars.findIndex((c) => c === '"' || c === '“');
  if (open < 0) return false;
  return chars.slice(open + 4).some((c) => c === '"' || c === '”');
}

/** The "(2020)" after the authors: the index of "(" and of ")", or null. */
function yearInParentheses(chars) {
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] !== '(') continue;
    if (chars.slice(i + 1, i + 6).join('').toLowerCase() === 'n.d.)') return { open: i, close: i + 5 };
    if (i + 5 < chars.length && chars.slice(i + 1, i + 5).every(isDigit)) {
      const year = Number(chars.slice(i + 1, i + 5).join(''));
      if (year >= 1500 && year <= 2099) {
        let k = i + 5;
        if (k < chars.length && chars[k] >= 'a' && chars[k] <= 'z') k += 1;
        if (k < chars.length && (chars[k] === ')' || chars[k] === ',')) {
          for (let x = k; x < chars.length; x += 1) if (chars[x] === ')') return { open: i, close: x };
          return null;
        }
      }
    }
  }
  return null;
}

/** The text after an entry's own number, or the whole text when it has none. */
const withoutMarker = (text, mark) => (mark ? text.slice(mark.tokenEnd).trim() : text);

/** The name an entry is sorted under (its first author's surname), as written and in lower case. */
function sortName(body) {
  const stop = new Set([',', '.', '(', '"']);
  const chars = Array.from(body);
  let n = 0;
  while (n < chars.length && !stop.has(chars[n])) n += 1;
  const name = chars.slice(0, n).join('').trim();
  return { name, lower: name.toLowerCase() };
}

function snippet(text) {
  const chars = Array.from(text);
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : text;
}

const entryLocation = (mark, text) => (mark ? `Reference ${mark.number}` : `Reference “${snippet(text)}”`);

function apaPieces(body, numbered) {
  const pieces = [];
  if (numbered) pieces.push('remove the number: APA lists references alphabetically, without numbers');
  if (!surnameFirst(body, true) && !organisationOrTitleFirst(body)) {
    pieces.push('write the first author as surname, comma, initials (Author, A. A.)');
  }
  const chars = Array.from(body);
  const paren = yearInParentheses(chars);
  if (paren) {
    const authors = chars.slice(0, paren.open).join('');
    if (authors.includes(' and ')) pieces.push('join the last two authors with &, not "and"');
    const next = chars.slice(paren.close + 1).find((c) => !isSpace(c));
    if (next !== '.') pieces.push('put a full stop after the year in brackets: (2020)');
  } else if (hasYear(body)) {
    pieces.push('put the year in parentheses right after the authors, like (2020)');
  }
  if (!endsProperly(body)) pieces.push('end the entry with a full stop (or a DOI or link)');
  return pieces;
}

function mlaPieces(body, numbered) {
  const pieces = [];
  if (numbered) pieces.push('remove the number: MLA lists works alphabetically, without numbers');
  if (!surnameFirst(body, false) && !organisationOrTitleFirst(body)) {
    pieces.push("start with the author's surname, a comma, then the first name (Author, Firstname)");
  }
  if (!endsProperly(body)) pieces.push('end the entry with a full stop');
  return pieces;
}

function ieeePieces(body, mark) {
  const pieces = [];
  if (!(mark && mark.style === ']')) pieces.push('start it with its number in brackets, like [3]');
  if (!initialsFirst(body)) pieces.push('write the first author as initials then surname, like A. Author');
  if (!hasQuotedTitle(body)) {
    pieces.push('put an article title in quotation marks (a book title is italic instead)');
  } else {
    const lower = body.toLowerCase();
    const hasDetails = ['vol.', 'pp.', 'no.', 'proc', 'available', 'doi', 'http', 'arxiv'].some((word) => lower.includes(word));
    if (!hasDetails) pieces.push('add the volume, issue and pages: vol. 3, no. 2, pp. 10-20');
  }
  if (!endsProperly(body)) pieces.push('end the entry with a full stop');
  return pieces;
}

/** UTF-16 offset of each character of a line, plus one for the end. */
function offsetsOf(lineStart, chars) {
  const at = [];
  let position = lineStart;
  for (const c of chars) {
    at.push(position);
    position += c.length;
  }
  at.push(position);
  return at;
}

/** The [start, end) character ranges of the whitespace-separated words in a..b. */
function wordSpans(chars, a, b) {
  const out = [];
  let i = a;
  while (i < b) {
    if (isSpace(chars[i])) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < b && !isSpace(chars[i])) i += 1;
    out.push([start, i]);
  }
  return out;
}

/** A word without the punctuation around it ("Smith," is "Smith", "Smith's" is "Smith"). */
function cleanWord(word) {
  let trimmed = word.join('').replace(/^[,;:&()"“”]+|[,;:&()"“”]+$/g, '');
  if (trimmed.endsWith("'s")) trimmed = trimmed.slice(0, -2);
  else if (trimmed.endsWith('’s')) trimmed = trimmed.slice(0, -2);
  return trimmed.replace(/\.+$/, '');
}

const LEAD_INS = new Set(['see', 'also', 'cf', 'e.g', 'eg', 'for', 'in', 'compare', 'but', 'and', 'as', 'by']);

/** The first year (1500-2099) anywhere in the text, with where it starts. */
function firstYear(chars) {
  let i = 0;
  while (i < chars.length) {
    if (!isDigit(chars[i])) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < chars.length && isDigit(chars[i])) i += 1;
    if (i - start === 4 && (start === 0 || !isAlnum(chars[start - 1]))) {
      const digits = chars.slice(start, i).join('');
      const value = Number(digits);
      if (value >= 1500 && value <= 2099) return { year: digits, at: start };
    }
  }
  return null;
}

/** The last year (1500-2099) in chars[a..b] and where it starts. */
function lastYear(chars, a, b) {
  let best = null;
  let i = a;
  while (i < b) {
    if (!isDigit(chars[i])) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < b && isDigit(chars[i])) i += 1;
    if (i - start === 4 && (start === a || !isAlnum(chars[start - 1]))) {
      const digits = chars.slice(start, i).join('');
      const value = Number(digits);
      if (value >= 1500 && value <= 2099) best = { year: digits, at: start };
    }
  }
  return best;
}

/** The first name-like word in chars[a..b], for "(see Smith & Jones, 2020)". */
function surnameBefore(chars, a, b) {
  for (const [start, end] of wordSpans(chars, a, b)) {
    const cleaned = cleanWord(chars.slice(start, end));
    if (startsUpper(cleaned) && !LEAD_INS.has(cleaned.toLowerCase())) return cleaned;
  }
  return null;
}

/**
 * For "Smith and Jones (2020)" or "Smith et al. (2020)": the first author, read
 * backwards from the "(". A name may be joined to the one before it by "and" or
 * "&"; anything else ("As Smith (2020)") ends the names.
 */
function narrativeSurname(chars, open) {
  const all = wordSpans(chars, 0, open);
  let first = null;
  let expectingName = true;
  let index = all.length;
  let steps = 0;
  while (index > 0 && steps < 12) {
    index -= 1;
    steps += 1;
    const [start, end] = all[index];
    const raw = chars.slice(start, end).join('');
    const cleaned = cleanWord(chars.slice(start, end));
    const lower = cleaned.toLowerCase();
    if (expectingName) {
      if (first === null && lower === 'al') {
        if (index === 0) break;
        const [beforeStart, beforeEnd] = all[index - 1];
        if (cleanWord(chars.slice(beforeStart, beforeEnd)).toLowerCase() !== 'et') break;
        index -= 1;
        steps += 1;
        expectingName = true;
        continue;
      }
      if (!startsUpper(cleaned)) break;
      first = cleaned;
      expectingName = false;
    } else if (lower === 'and' || raw === '&') {
      expectingName = true;
    } else {
      break;
    }
  }
  return first;
}

/** Every APA-style author-year citation on one line. */
function apaCitations(line) {
  const chars = Array.from(line.text);
  const at = offsetsOf(line.start, chars);
  const found = [];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== '(') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < chars.length && j - i <= 200 && chars[j] !== ')' && chars[j] !== '(') j += 1;
    if (j >= chars.length || chars[j] !== ')') {
      i += 1;
      continue;
    }
    let partStart = i + 1;
    let firstPart = true;
    for (let k = i + 1; k <= j; k += 1) {
      if (k === j || chars[k] === ';') {
        const year = lastYear(chars, partStart, k);
        if (year) {
          let surname = surnameBefore(chars, partStart, year.at);
          if (surname === null && firstPart && chars.slice(partStart, year.at).every((c) => !isAlnum(c))) {
            surname = narrativeSurname(chars, i);
          }
          if (surname !== null) {
            // "(Smith, 2020; Jones, 2019)": point at the one source, not the whole bracket
            let start = at[i];
            let end = at[j + 1];
            if (chars.slice(i + 1, j).includes(';')) {
              let a = partStart;
              while (a < k && isSpace(chars[a])) a += 1;
              let b = k;
              while (b > a && isSpace(chars[b - 1])) b -= 1;
              start = at[a];
              end = at[b];
            }
            found.push({ surname: surname.toLowerCase(), display: surname, year: year.year, start, end });
          }
        }
        partStart = k + 1;
        firstPart = false;
      }
    }
    i = j + 1;
  }
  return found;
}

const NOT_NAMES = new Set([
  'figure', 'fig', 'table', 'section', 'chapter', 'appendix', 'equation', 'eq', 'page', 'pages', 'pp', 'see',
  'ibid', 'cf', 'also', 'below', 'above', 'note', 'article', 'part', 'volume', 'vol', 'example', 'eg',
]);

/** "45" or "45-47" (hyphen or en dash). */
function isPages(word) {
  const chars = Array.from(word);
  let digits = 0;
  while (digits < chars.length && isDigit(chars[digits])) digits += 1;
  if (digits === 0) return false;
  if (digits === chars.length) return true;
  return (chars[digits] === '-' || chars[digits] === '–')
    && chars.length > digits + 1
    && chars.slice(digits + 1).every(isDigit);
}

const isNameWord = (word) => startsUpper(word)
  && Array.from(word).every((c) => isAlpha(c) || c === "'" || c === '’' || c === '-');

/** Every MLA-style "(Surname 45)" citation on one line. A page number is required. */
function mlaCitations(line) {
  const chars = Array.from(line.text);
  const at = offsetsOf(line.start, chars);
  const found = [];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== '(') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < chars.length && j - i <= 80 && chars[j] !== ')' && chars[j] !== '(') j += 1;
    if (j >= chars.length || chars[j] !== ')') {
      i += 1;
      continue;
    }
    const parts = splitWords(chars.slice(i + 1, j).join(''));
    const first = parts[0];
    if (first !== undefined && isNameWord(first) && !NOT_NAMES.has(first.toLowerCase())) {
      let index = 1;
      if (parts[index] === 'and' && parts[index + 1] !== undefined && isNameWord(parts[index + 1])) index += 2;
      else if (parts[index] === 'et' && parts[index + 1] === 'al.') index += 2;
      if (index + 1 === parts.length && isPages(parts[index])) found.push({ display: first, start: at[i], end: at[j + 1] });
    }
    i = j + 1;
  }
  return found;
}

/** "smith" matches "smith", "smith jones" and "world health smith". */
const sameSurname = (reference, cited) => reference === cited
  || reference.startsWith(`${cited} `)
  || reference.endsWith(` ${cited}`);

/** IEEE numbers references in the order they are first cited. */
function ieeeOrderIssues(list, lines, issues) {
  const listed = list.entries.filter((e) => e.mark).map((e) => e.mark.number);
  if (!listed.length) return;
  const cited = bodyCitations(list, lines).filter((c) => listed.includes(c.number));
  const seen = [];
  for (const citation of cited) {
    if (seen.includes(citation.number)) continue;
    const waiting = Math.min(...cited.map((c) => c.number).filter((n) => !seen.includes(n)));
    seen.push(citation.number);
    if (citation.number > waiting) {
      if (issues.length >= MAX_SEQUENCE_ISSUES) return;
      issues.push(citationIssue(
        `order-cite-${citation.start}`,
        'References are out of order',
        `[${citation.number}] is cited before [${waiting}]. IEEE numbers references in the order they first appear in the text.`,
        'low',
        `Citation [${citation.number}]`,
        citation.start,
        citation.end,
      ));
    }
  }
}

/** "Smith (2020)", or just "Smith" when the entry gives no year. */
const citedLabel = (name, year) => (year ? `${name} (${year})` : name);

/** An entry with no year matches a citation of that surname in any year. */
const yearMatches = (entryYear, citedYear) => entryYear === '' || entryYear === citedYear;

/** APA: "(Smith, 2020)" in the text against "Smith, J. (2020)." in the list. */
function authorYearIssues(list, lines, issues) {
  // A stray "[2]" or a year outside brackets is a style fault reported above; the entry still counts here.
  const entries = [];
  for (const { line, mark } of list.entries) {
    if (splitWords(line.text).length < 3) continue;
    const body = withoutMarker(line.text, mark);
    const chars = Array.from(body);
    const { name, lower } = sortName(body);
    if (!lower) continue;
    const paren = yearInParentheses(chars);
    let year;
    if (paren) {
      const digits = chars.slice(paren.open + 1, paren.open + 5).join('');
      year = /^[0-9]{4}$/.test(digits) ? digits : 'nd';
    } else {
      const first = firstYear(chars);
      year = first ? first.year : '';
    }
    entries.push({ name, lower, year, line, location: entryLocation(mark, line.text), numbered: Boolean(mark) });
  }
  // A numbered entry is already reported as uncited by the numbered checks when the text cites by number.
  const numericCited = bodyCitations(list, lines).length > 0;
  const cites = lines.filter((line) => !list.contains(line) && !list.isHeading(line)).flatMap(apaCitations);

  const reported = [];
  for (const cite of cites) {
    if (entries.some((e) => sameSurname(e.lower, cite.surname) && yearMatches(e.year, cite.year))) continue;
    const key = `${cite.surname}|${cite.year}`;
    if (reported.includes(key)) continue;
    if (issues.length >= MAX_SEQUENCE_ISSUES) return;
    reported.push(key);
    issues.push(citationIssue(
      `citation-missing-${cite.start}`,
      'Citation has no matching reference',
      `No reference for “${citedLabel(cite.display, cite.year)}” in the reference list.`,
      'medium',
      'Citation',
      cite.start,
      cite.end,
    ));
  }
  if (!cites.length) return;
  for (const entry of entries) {
    if (cites.some((cite) => sameSurname(entry.lower, cite.surname) && yearMatches(entry.year, cite.year))) continue;
    if (entry.numbered && numericCited) continue;
    if (issues.length >= MAX_SEQUENCE_ISSUES) return;
    issues.push(citationIssue(
      `reference-uncited-${entry.line.start}`,
      'Reference is never cited',
      `Nothing in the text cites “${citedLabel(entry.name, entry.year)}”.`,
      'low',
      entry.location,
      entry.line.start,
      entry.line.end,
    ));
  }
}

/** MLA: "(Smith 45)" in the text against "Smith, John." in the list. */
function surnameIssues(list, lines, issues) {
  const entries = [];
  for (const { line, mark } of list.entries) {
    if (splitWords(line.text).length < 3) continue;
    const { name, lower } = sortName(withoutMarker(line.text, mark));
    if (lower) entries.push({ name, lower, line, location: entryLocation(mark, line.text), numbered: Boolean(mark) });
  }
  const numericCited = bodyCitations(list, lines).length > 0;
  const cites = lines.filter((line) => !list.contains(line) && !list.isHeading(line)).flatMap(mlaCitations);

  const reported = [];
  for (const cite of cites) {
    const lower = cite.display.toLowerCase();
    if (entries.some((e) => sameSurname(e.lower, lower)) || reported.includes(lower)) continue;
    if (issues.length >= MAX_SEQUENCE_ISSUES) return;
    reported.push(lower);
    issues.push(citationIssue(
      `citation-missing-${cite.start}`,
      'Citation has no matching reference',
      `No entry for “${cite.display}” in the Works Cited list.`,
      'medium',
      'Citation',
      cite.start,
      cite.end,
    ));
  }
  if (!cites.length) return;
  for (const entry of entries) {
    if (cites.some((cite) => sameSurname(entry.lower, cite.display.toLowerCase()))) continue;
    if (entry.numbered && numericCited) continue;
    if (issues.length >= MAX_SEQUENCE_ISSUES) return;
    issues.push(citationIssue(
      `reference-uncited-${entry.line.start}`,
      'Reference is never cited',
      `Nothing in the text cites “${entry.name}”.`,
      'low',
      entry.location,
      entry.line.start,
      entry.line.end,
    ));
  }
}

/** Checks a document's reference list and citations against the style the writer chose. */
function citationStyleIssues(style, documentLength, headings, lines) {
  const issues = [];
  const list = findReferenceList(documentLength, headings, lines);
  if (!list) return issues;
  const info = STYLE_INFO[style];

  // the list's name
  const shown = headingText(list.heading.title).replace(/:+$/, '').trim();
  if (shown.toLowerCase() !== info.listName.toLowerCase()) {
    issues.push(citationIssue(
      `heading-${list.heading.start}`,
      `Reference list should be called “${info.listName}”`,
      `${style} style calls this list “${info.listName}”; this document calls it “${shown}”.`,
      'low',
      'Reference list heading',
      list.heading.start,
      list.heading.end,
    ));
  }

  // each entry's shape
  for (const { line, mark } of list.entries) {
    if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
    if (splitWords(line.text).length < 3) continue;
    const body = withoutMarker(line.text, mark);
    let pieces;
    if (style === 'APA') pieces = apaPieces(body, Boolean(mark));
    else if (style === 'MLA') pieces = mlaPieces(body, Boolean(mark));
    else pieces = ieeePieces(body, mark);
    if (!pieces.length) continue;
    issues.push(citationIssue(
      `style-${line.start}`,
      `Reference is not in ${style} style`,
      `To match ${style} style: ${pieces.join('; ')}. Example: ${info.example}`,
      'medium',
      entryLocation(mark, line.text),
      line.start,
      line.end,
    ));
  }

  // the order of the list
  if (style !== 'IEEE') {
    let before = null;
    for (const { line, mark } of list.entries) {
      const { name, lower } = sortName(withoutMarker(line.text, mark));
      if (!lower) continue;
      if (before && lower < before.lower) {
        if (issues.length >= MAX_SEQUENCE_ISSUES) return issues;
        issues.push(citationIssue(
          `order-${line.start}`,
          'References are out of order',
          `“${name}” should come before “${before.name}”: ${style} style lists references alphabetically by the first author's surname.`,
          'low',
          entryLocation(mark, line.text),
          line.start,
          line.end,
        ));
      }
      before = { name, lower };
    }
  }

  if (style === 'IEEE') ieeeOrderIssues(list, lines, issues);
  else if (style === 'APA') authorYearIssues(list, lines, issues);
  else surnameIssues(list, lines, issues);
  return issues;
}

const label = (sentence) => `Sentence ${sentence.index + 1}`;
const topic = (shared) => shared.slice(0, 2).join(' / ');

/**
 * Reads a document and reports what is wrong with it.
 * `outline` is the headings (see parseOutline), `kind` the document's type and
 * `style` the citation style chosen ("APA", "MLA", "IEEE" or "" for none).
 */
export function analyze(text, outline = '', kind = 'Other', style = '') {
  const sentences = splitSentences(text).slice(0, MAX_SENTENCES);
  const prepared = sentences
    .map((sentence) => ({
      sentence,
      words: contentWords(sentence.text),
      numbers: numbersIn(sentence),
      negation: negationOf(sentence.text),
    }))
    .filter((item) => item.sentence.text.split(/\s+/).length <= 120);

  const issues = [];
  for (let i = 0; i < prepared.length && issues.length < MAX_ISSUES; i += 1) {
    for (let j = i + 1; j < prepared.length && issues.length < MAX_ISSUES; j += 1) {
      const a = prepared[i];
      const b = prepared[j];
      const shared = sharedWords(a.words, b.words);
      if (shared.length < 2) continue;
      const before = issues.length;

      a.numbers.forEach((first) => {
        b.numbers.forEach((second) => {
          const comparable = first.unit === second.unit
            && (first.unit !== '' || shared.length >= 3)
            && first.value !== second.value;
          if (!comparable) return;
          issues.push({
            id: `number-${first.start}-${second.start}`,
            kind: 'contradiction',
            title: 'Numbers do not match',
            message: `${label(a.sentence)} says ${first.raw} but ${label(b.sentence).toLowerCase()} says ${second.raw} about the same topic — ${topic(shared)}${first.unit ? ` (${first.unit})` : ''}.`,
            severity: first.unit ? 'high' : 'medium',
            location: `${label(a.sentence)} · ${label(b.sentence)}`,
            start: first.start,
            end: first.end,
            related: [{ start: second.start, end: second.end }],
            repairs: [
              { label: `Use ${first.raw} everywhere`, start: second.start, end: second.end, text: first.raw },
              { label: `Use ${second.raw} everywhere`, start: first.start, end: first.end, text: second.raw },
            ],
            suggestion: null,
            outline: [],
          });
        });
      });

      const oneIsNegated = Boolean(a.negation) !== Boolean(b.negation);
      if (oneIsNegated && shared.length >= 3 && similarity(a.words, b.words) >= 0.5) {
        issues.push({
          id: `claim-${a.sentence.start}-${b.sentence.start}`,
          kind: 'contradiction',
          title: 'Claims disagree',
          message: `These two sentences make the same claim about ${topic(shared)}, but one of them says "${a.negation || b.negation}". Keep one version.`,
          severity: 'medium',
          location: `${label(a.sentence)} · ${label(b.sentence)}`,
          start: a.sentence.start,
          end: a.sentence.end,
          related: [{ start: b.sentence.start, end: b.sentence.end }],
          repairs: [],
          suggestion: null,
          outline: [],
        });
      }

      if (issues.length === before && !oneIsNegated && a.words.length >= 5 && b.words.length >= 5) {
        const score = similarity(a.words, b.words);
        if (score >= 0.7) {
          issues.push({
            id: `repeat-${a.sentence.start}-${b.sentence.start}`,
            kind: 'redundancy',
            title: 'Repeated sentence',
            message: `${label(b.sentence)} repeats ${label(a.sentence).toLowerCase()} almost word for word (${Math.round(score * 100)}% the same).`,
            severity: 'low',
            location: `${label(a.sentence)} · ${label(b.sentence)}`,
            start: b.sentence.start,
            end: b.sentence.end,
            related: [{ start: a.sentence.start, end: a.sentence.end }],
            repairs: [{ label: 'Delete the repeat', start: b.sentence.start, end: b.sentence.end, text: '' }],
            suggestion: null,
            outline: [],
          });
        }
      }
    }
  }

  const headings = parseOutline(outline);
  issues.push(...structureIssues(text, headings, kind));
  const allLines = documentLines(text);
  issues.push(...numberingIssues(headings, allLines));
  issues.push(...referenceIssues(text.length, headings, allLines));
  const chosen = parseStyle(style);
  if (chosen) issues.push(...citationStyleIssues(chosen, text.length, headings, allLines));

  return {
    version: 'javascript',
    issues,
    stats: {
      sentences: sentences.length,
      words: wordsOf(text).length,
      numbers: prepared.reduce((total, item) => total + item.numbers.length, 0),
      headings: headings.length,
      // 16 rules: 3 about the sentences, 6 about the structure, 1 about
      // numbering, 3 about references and 3 about citation style.
      checks: 16,
    },
  };
}
