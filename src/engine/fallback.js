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
    push(text, begin, i + 1, sentences);
    begin = i + 1;
  }
  push(text, begin, text.length, sentences);
  return sentences;
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
  const pattern = /\d[\d,]*(?:\.\d+)?/g;
  let match = pattern.exec(body);
  while (match) {
    let value = Number(match[0].replace(/,/g, ''));
    let unit = '';
    let start = match.index;
    let end = match.index + match[0].length;

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
    pattern.lastIndex = Math.max(pattern.lastIndex, end);
    match = pattern.exec(body);
  }
  return facts;
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

const label = (sentence) => `Sentence ${sentence.index + 1}`;
const topic = (shared) => shared.slice(0, 2).join(' / ');

/**
 * Reads a document and reports what is wrong with it.
 * `outline` is the headings (see parseOutline) and `kind` the document's type.
 */
export function analyze(text, outline = '', kind = 'Other') {
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

  return {
    version: 'javascript',
    issues,
    stats: {
      sentences: sentences.length,
      words: wordsOf(text).length,
      numbers: prepared.reduce((total, item) => total + item.numbers.length, 0),
      headings: headings.length,
      // 9 rules: 3 about the sentences, 6 about the structure.
      checks: 9,
    },
  };
}
