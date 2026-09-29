/**
 * checks.js — the things DocuMend looks for, named once.
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
    id: 'nli-contradiction',
    kind: 'contradiction',
    title: 'Claims may disagree',
    blurb: 'A small on-device language model flagged two sentences as possibly conflicting, even though they don’t share the same words. Lower confidence than the other checks — worth a second look before trusting it.',
  },
  {
    id: 'repeat',
    kind: 'redundancy',
    title: 'Repeated sentence',
    blurb: 'A sentence says what an earlier one already said.',
  },
  {
    id: 'no-headings',
    kind: 'structure',
    title: 'No headings yet',
    blurb: 'A document with no headings at all, where its type says it should have sections. One click adds the whole outline.',
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
  {
    id: 'numbering',
    kind: 'structure',
    title: 'Numbering has a gap',
    blurb: 'Headings or list items numbered 1, 2, 4 — or repeating a number. One click renumbers the odd one out.',
  },
  {
    id: 'reference-year',
    kind: 'citation',
    title: 'Reference has no year',
    blurb: 'An entry in your reference list that gives no year, so a reader cannot tell which edition it means.',
  },
  {
    id: 'citation-missing',
    kind: 'citation',
    title: 'Citation has no matching reference',
    blurb: 'A citation in the text with no entry in the reference list: [5] with no number 5, or (Smith, 2020) with no Smith 2020.',
  },
  {
    id: 'reference-uncited',
    kind: 'citation',
    title: 'Reference is never cited',
    blurb: 'A reference in your list that nothing in the text points at.',
  },
  {
    id: 'reference-style',
    kind: 'citation',
    title: 'Reference is not in the chosen style',
    blurb: 'Needs a citation style chosen for the document. An entry that does not follow it, with what to change and an example of the right form.',
    matches: (title) => title.startsWith('Reference is not in ') && title.endsWith(' style'),
  },
  {
    id: 'reference-order',
    kind: 'citation',
    title: 'References are out of order',
    blurb: 'Needs a citation style. APA and MLA lists run alphabetically by surname; IEEE numbers follow the order of first citation.',
  },
  {
    id: 'reference-list-name',
    kind: 'citation',
    title: 'Reference list has the wrong name',
    blurb: 'Needs a citation style. MLA calls the list "Works Cited"; APA and IEEE call it "References".',
    matches: (title) => title.startsWith('Reference list should be called'),
  },
  {
    id: 'isbn',
    kind: 'citation',
    title: 'ISBN is not valid',
    blurb: 'An ISBN with the wrong number of digits, or whose check digit doesn’t match the rest of the number.',
  },
  {
    id: 'doi',
    kind: 'citation',
    title: 'DOI is not valid',
    blurb: 'A DOI that doesn’t match the standard shape: "10.", a registrant code, a slash, then the publisher’s suffix.',
  },
  {
    id: 'extra-space',
    kind: 'structure',
    title: 'Extra space',
    blurb: 'Two or more spaces in a row between words.',
  },
  {
    id: 'space-before-punctuation',
    kind: 'structure',
    title: 'Space before punctuation',
    blurb: 'A stray space before a full stop, comma or similar mark.',
  },
  {
    id: 'missing-space-after-punctuation',
    kind: 'structure',
    title: 'Missing space after punctuation',
    blurb: 'A comma, semicolon, colon, "!" or "?" running straight into the next word.',
  },
  {
    id: 'repeated-punctuation',
    kind: 'structure',
    title: 'Repeated punctuation',
    blurb: 'A mark repeated past what is ever correct — "!!", ",," or a run of dots that is not a proper ellipsis.',
  },
  {
    id: 'repeated-word',
    kind: 'structure',
    title: 'Repeated word',
    blurb: 'The same word written twice in a row, like "the the".',
  },
  {
    id: 'spelling-inconsistent',
    kind: 'structure',
    title: 'Spelling is inconsistent',
    blurb: 'The document spells the same word two different ways — "colour" and "color", "organise" and "organize".',
  },
  {
    id: 'misspelled-word',
    kind: 'structure',
    title: 'Misspelled word',
    blurb: 'A lower-case word not in the checker’s ten-thousand-word list, with up to three close corrections to choose from. Capitalized words are always left alone, since they are almost always a name.',
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
  citation: 'References',
};
