/**
 * checks.js — the eight things DocuMend looks for, named once.
 *
 * The engine (Rust, and its JavaScript twin in fallback.js) reports issues; it
 * does not report which rule produced them beyond a `kind` and a `title`. This
 * file is what turns an issue back into the rule that raised it, so that the
 * Settings page can list the rules and switch them off, and the editor can
 * honour that.
 *
 * Matching is by title, because both engines produce exactly the same titles —
 * that equivalence is what the fallback is tested against. The one exception
 * is the missing-section rule, whose title names the section it is missing
 * ("“Abstract” section is missing"), so it is matched by its ending.
 *
 * If a rule is ever added to the engine, add it here too; an unknown issue is
 * always shown rather than silently hidden.
 */

export const CHECKS = [
  {
    id: 'numbers',
    kind: 'contradiction',
    title: 'Numbers do not match',
    blurb: 'Two sentences about the same thing give different figures — 40% in one place, 45% in another.',
  },
  {
    id: 'claims',
    kind: 'contradiction',
    title: 'Claims disagree',
    blurb: 'Nearly the same sentence appears twice, one of them negated.',
  },
  {
    id: 'repeat',
    kind: 'redundancy',
    title: 'Repeated sentence',
    blurb: 'A sentence says what an earlier one already said.',
  },
  {
    id: 'missing-section',
    kind: 'structure',
    title: 'A section is missing',
    blurb: 'A section this kind of document usually has, with no heading for it. One click adds the heading.',
    matches: (title) => title.endsWith('section is missing'),
  },
  {
    id: 'standard-name',
    kind: 'structure',
    title: 'A more standard name',
    blurb: 'A heading means the right thing under an unusual name — "Results" where readers expect "Conclusion". Renaming keeps your numbering.',
  },
  {
    id: 'empty-section',
    kind: 'structure',
    title: 'Section has no text',
    blurb: 'A heading with nothing written under it.',
  },
  {
    id: 'level-skip',
    kind: 'structure',
    title: 'Heading level skipped',
    blurb: 'A jump from Heading 1 straight to Heading 3, which breaks the contents page.',
  },
  {
    id: 'duplicate-name',
    kind: 'structure',
    title: 'Two sections share a name',
    blurb: 'The same heading appears twice, so a cross-reference cannot say which one it means.',
  },
];

/** Which rule raised this issue, or null when it is one we do not know. */
export function checkIdOf(issue) {
  const title = issue?.title ?? '';
  const found = CHECKS.find((check) => (check.matches ? check.matches(title) : check.title === title));
  return found?.id ?? null;
}

/** The three families the review panel groups by. */
export const KIND_LABELS = {
  contradiction: 'Contradictions',
  redundancy: 'Repetition',
  structure: 'Structure',
};
