/**
 * The documents both engines are tested on.
 *
 * Two kinds: hand-written cases, each aimed at one behaviour, and a seeded
 * generator that builds many random documents. The generator uses a fixed
 * seed, so a failure can be reproduced exactly.
 */

/** Builds a document and the outline the editor would send for it. */
export function withOutline(parts) {
  let text = '';
  const lines = [];
  for (const [level, title, body] of parts) {
    const start = text.length;
    text += title;
    const end = text.length;
    text += '\n';
    lines.push([level, start, end, title].join('\t'));
    if (body) text += `${body}\n`;
  }
  return { text, outline: lines.join('\n') };
}

const plain = (text) => ({ text, outline: '' });

const SURVEY = `The pilot survey reached 120 students at the university. Most students said the library was open late enough. The pilot survey reached 250 students at the university.

The new scheduling system reduced average waiting time for all patients. The new scheduling system did not reduce average waiting time for all patients.

The annual software licence budget is PKR 45,000 per year. The project budget for the software licence was set at PKR 32,000 per year.

Students who attend every lecture perform better in the final examination. Students who attend every lecture perform better in the final examination results.`;

const thesis = withOutline([
  [1, 'Summary', ''],
  [1, 'Introduction', 'This thesis studies how students use the campus library.'],
  [3, 'Study Design', 'We surveyed students across three faculties.'],
  [1, 'Findings', 'Most students prefer quiet study rooms over open halls.'],
  [1, 'Methodology', ''],
  [1, 'Conclusion', 'Quiet rooms matter most to students.'],
  [1, 'Conclusion', 'Library hours should be extended.'],
]);

const numbered = withOutline([
  [1, '1. Introduction', 'Opening words about the topic of study.'],
  [1, '2. Related Work', 'Earlier studies looked at reading habits.'],
  [1, '3. Approach', 'We interviewed twelve librarians.'],
  [1, '4. Evaluation', 'Results were positive overall.'],
  [1, '5. Conclusions', 'Libraries matter to students.'],
]);

const legal = withOutline([
  [1, 'Parties', 'This agreement is between Acme and Beta.'],
  [1, 'Definitions', 'Terms are defined here.'],
  [1, 'Scope', 'The scope is consulting.'],
  [1, 'Term', 'The term is twelve months.'],
]);

const report = withOutline([
  [1, 'Overview', 'The purpose of this report is to review sales.'],
  [1, 'Context', 'Sales fell in the third quarter.'],
  [1, 'Analysis', 'The decline was 12 percent overall.'],
  [1, 'Next Steps', 'Hire two more agents.'],
]);

const lastHeadingEmpty = withOutline([
  [1, 'Introduction', 'Some words here.'],
  [1, 'Methods', 'More words here.'],
  [1, 'Results', ''],
]);

const oneHeading = withOutline([[1, 'Introduction', 'Only one heading in this whole document.']]);

const startsAtThree = withOutline([
  [3, 'Deep Start', 'Body text under a deep heading.'],
  [1, 'Top Level', 'Body text.'],
  [2, 'Second Level', 'Body text again.'],
  [4, 'Fourth Level', 'Body text one more time.'],
]);

const emojiBeforeHeadings = withOutline([
  [1, 'Introduction \u{1F600}', 'Emoji \u{1F600}\u{1F600} sit before the next heading.'],
  [1, 'Methods', ''],
  [1, 'Results', 'Café owners reported 5.5 million rupees.'],
]);

const cases = [
  { name: 'survey text, no outline', ...plain(SURVEY), kind: 'Thesis' },
  { name: 'survey text, no outline, Report', ...plain(SURVEY), kind: 'Report' },
  { name: 'survey text, no outline, Other', ...plain(SURVEY), kind: 'Other' },
  { name: 'thesis outline as Thesis', ...thesis, kind: 'Thesis' },
  { name: 'thesis outline as Research paper', ...thesis, kind: 'Research paper' },
  { name: 'thesis outline as Report', ...thesis, kind: 'Report' },
  { name: 'thesis outline as Legal', ...thesis, kind: 'Legal' },
  { name: 'thesis outline as Other', ...thesis, kind: 'Other' },
  { name: 'numbered headings as Thesis', ...numbered, kind: 'Thesis' },
  { name: 'numbered headings as Research paper', ...numbered, kind: 'Research paper' },
  { name: 'legal outline as Legal', ...legal, kind: 'Legal' },
  { name: 'report outline as Report', ...report, kind: 'Report' },
  { name: 'last heading empty', ...lastHeadingEmpty, kind: 'Thesis' },
  { name: 'a single heading stays quiet', ...oneHeading, kind: 'Thesis' },
  { name: 'levels 3, 1, 2, 4', ...startsAtThree, kind: 'Other' },
  { name: 'emoji and decimals near headings', ...emojiBeforeHeadings, kind: 'Report' },
  { name: 'empty text', ...plain(''), kind: 'Thesis' },
  { name: 'whitespace only', ...plain('   \n\n  \t '), kind: 'Thesis' },
  { name: 'one short sentence', ...plain('Hello world.'), kind: 'Other' },
  { name: 'dollar amounts', ...plain('The grant was $10,000 in the executive summary. The grant was $12,000 in the financial breakdown.'), kind: 'Other' },
  { name: 'percent values', ...plain('Attendance rose by 10 percent this term for the evening classes. Attendance rose by 15 percent this term for the evening classes.'), kind: 'Other' },
  { name: 'percent signs', ...plain('Enrolment grew 5% across the engineering faculty last year. Enrolment grew 7% across the engineering faculty last year.'), kind: 'Other' },
  { name: 'unitless numbers with many shared words', ...plain('The committee reviewed 12 applications from rural districts this week. The committee reviewed 15 applications from rural districts this week.'), kind: 'Other' },
  { name: 'contraction negation', ...plain('The model does converge on the small training set quickly. The model doesn\'t converge on the small training set quickly.'), kind: 'Other' },
  { name: 'never and cannot', ...plain('Users can export every document from the dashboard directly. Users cannot export every document from the dashboard directly.'), kind: 'Other' },
  { name: 'exact duplicate sentences', ...plain('Privacy matters most to legal professionals working alone. Privacy matters most to legal professionals working alone.'), kind: 'Other' },
  { name: 'abbreviations and decimals', ...plain('Dr. Smith measured 3.14 metres in the U.S. lab on Jan. 5. Dr. Smith measured 2.71 metres in the U.S. lab on Jan. 5.'), kind: 'Other' },
  { name: 'CRLF line endings', ...plain('The pilot survey reached 120 students at the university.\r\n\r\nThe pilot survey reached 250 students at the university.\r\n'), kind: 'Other' },
  { name: 'curly quotes and dashes', ...plain('“The budget was 5 million”, the report said — twice. “The budget was 6 million”, the report said — again.'), kind: 'Other' },
  { name: 'urdu text with numbers', ...plain('ٹیسٹ ٹیسٹ fee was 500 rupees for the course. ٹیسٹ ٹیسٹ fee was 700 rupees for the course.'), kind: 'Other' },
  {
    name: 'one very long sentence',
    ...plain(`${'The system processes many documents every single day '.repeat(30)}and stops. The system processes 12 documents.`),
    kind: 'Other',
  },
  {
    name: 'many sentences with numbers (limits)',
    ...plain(Array.from({ length: 220 }, (_, i) => `The regional office processed ${100 + i} invoices for the finance department in week ${i % 7}.`).join(' ')),
    kind: 'Other',
  },
  {
    name: '"this" vs "another" is not the same topic',
    ...plain('The budget for this project is PKR 23,000. Later the budget for this project is PKR 20,000. The budget for another project is PKR 70,000.'),
    kind: 'Other',
  },
  {
    name: '"another" on both sides still compares',
    ...plain('The budget for another project is PKR 23,000. Later the budget for another project is PKR 20,000.'),
    kind: 'Other',
  },
  {
    name: '"other" vs plain is not the same topic',
    ...plain('The clinic reported 40 patients this month. The other clinic reported 65 patients this month.'),
    kind: 'Other',
  },
  {
    name: 'correct ISBN-10 and ISBN-13 are quiet',
    ...plain('See ISBN 0-13-468599-7 for the first edition, or ISBN 978-0-13-468599-1 for the second. ISBN-10 0-8044-2957-X also works.'),
    kind: 'Other',
  },
  {
    name: 'ISBN with a bad check digit',
    ...plain('See ISBN 978-0-13-468599-2 for details, and ISBN 0-13-468599-1 for the older one.'),
    kind: 'Other',
  },
  {
    name: 'ISBN with the wrong number of digits',
    ...plain('The book (ISBN 978-0-13-468) has no proper number.'),
    kind: 'Other',
  },
  {
    name: 'correct DOIs in different forms are quiet',
    ...plain('See doi:10.1000/xyz123 and also https://doi.org/10.1038/nphys1170, cited here (doi:10.1000/abc.def.2020).'),
    kind: 'Other',
  },
  {
    name: 'DOI missing its slash or prefix',
    ...plain('See doi:10.1000xyz123 for one paper and doi:1000/xyz123 for another.'),
    kind: 'Other',
  },
  {
    name: 'identifiers inside a reference list',
    ...withOutline([
      [1, 'Introduction', 'See the cited work.'],
      [1, 'References', '[1] A. Author, "A title," Journal, 2020. doi:10.1000/xyz123\n[2] B. Writer, Some Book, 2019. ISBN 978-0-13-468599-2.'],
    ]),
    kind: 'Other',
  },
  {
    name: 'a bare number is never mistaken for an identifier',
    ...plain('The population reached 9780134685991 last year, up from 20,000. She said isbnormal readings were high near the doily shop.'),
    kind: 'Other',
  },
];

const numberedGap = withOutline([
  [1, '1. Introduction', 'Opening words about the topic.'],
  [1, '3. Results', 'Numbers and findings.'],
  [1, '4. Conclusion', 'Closing words.'],
]);
const numberedDup = withOutline([
  [1, '1. Introduction', 'Opening.'], [1, '2. Methods', 'How.'], [1, '2. Results', 'What.'],
]);
const numberedBack = withOutline([
  [1, '1. A', 'a a a.'], [1, '2. B', 'b b b.'], [1, '3. C', 'c c c.'], [1, '2. D', 'd d d.'],
]);
const numberedSub = withOutline([
  [1, '1. A', 'a.'], [2, '1.1 B', 'b.'], [1, '2. C', 'c.'], [2, '2.1 D', 'd.'], [2, '2.4 E', 'e.'], [1, '1. Appendix', 'f.'],
]);
const listGap = plain('Steps:\n1. Mix the flour.\n2. Add the water.\n4. Bake it.\n5. Cool it.');
const listMore = plain('1) One\n2) Two\n6) Six\nSome text between.\n1) Fresh\n1) Again\n2) Two');
const bracketList = plain('[1] First item here\n[2] Second item here\n[5] Fifth item here');
const yearFirst = plain('2023. A year at the start of the line.\n2024. Another year.');

const refs = (body) => withOutline([
  [1, '1. Introduction', 'We build on earlier work [1] and [3].'],
  [1, '2. References', body],
]);
const refsComplete = withOutline([
  [1, 'Introduction', 'Earlier work [1, 2] shows this. See also [3-4].'],
  [1, 'References', '[1] A. Author, "Title one," Journal, 2020.\n[2] B. Writer, "Title two," Journal, 2019.\n[3] C. Person, "Title three," Journal, 2018.\n[4] D. Other, "Title four," Journal, 2017.'],
]);

cases.push(
  { name: 'numbered headings with a gap', ...numberedGap, kind: 'Thesis' },
  { name: 'numbered headings repeat a number', ...numberedDup, kind: 'Thesis' },
  { name: 'numbered headings go backwards', ...numberedBack, kind: 'Other' },
  { name: 'numbered sub-headings', ...numberedSub, kind: 'Other' },
  { name: 'typed list with a gap', ...listGap, kind: 'Other' },
  { name: 'typed lists: paren style, restart, repeat', ...listMore, kind: 'Other' },
  { name: 'bracket-numbered list', ...bracketList, kind: 'Other' },
  { name: 'lines starting with a year are not a list', ...yearFirst, kind: 'Other' },
  { name: 'reference list, everything fine', ...refsComplete, kind: 'Thesis' },
  { name: 'reference missing a year', ...refs('[1] A. Author, "Title one," Journal.\n[2] B. Writer, "Title two," Journal, 2019.\n[3] C. Person, "Title three," Journal, 2018.'), kind: 'Thesis' },
  { name: 'citation without a reference, reference without a citation', ...refs('[1] A. Author, "Title one," Journal, 2020.\n[2] B. Writer, "Title two," Journal, 2019.'), kind: 'Thesis' },
  { name: 'reference list with a numbering gap', ...refs('[1] A. Author, "Title one," Journal, 2020.\n[2] B. Writer, "Title two," Journal, 2019.\n[4] D. Other, "Title four," Journal, 2017.'), kind: 'Thesis' },
  { name: 'unnumbered (author-year) reference list', ...withOutline([[1, 'Bibliography', 'Smith, J. (2020). A study of things. Journal of Stuff.\nJones, K. A study without a date. Journal of Stuff.\nEcho.']]), kind: 'Other' },
  { name: 'references heading with colon and number', ...withOutline([[1, 'Body', 'Cited [2] here.'], [1, '7. Works Cited:', '[1] A. Author, T, 2020.\n[2] B. Writer, U, 2021.']]), kind: 'Other' },
  { name: 'citation ranges and en dashes', ...withOutline([[1, 'Text', 'Shown in [1–3], [2, 5] and [7-8].'], [1, 'References', '[1] a b 2020.\n[2] c d 2021.\n[3] e f 2022.\n[5] g h 2023.']]), kind: 'Other' },
  { name: 'unicode in references', ...withOutline([[1, 'Body', 'See [1] café \u{1F600} [2].'], [1, 'References', '[1] Café \u{1F600} Author, 2020, Paris.\n[2] ٹیسٹ author no date here.']]), kind: 'Other' },
);

/* ---- citation styles: each hand-written document is checked under every style ---- */

const styleDocuments = {
  'APA-shaped list, all matching': withOutline([
    [1, 'Introduction', 'Prior work (Jones, 2018) and Smith (2020) agree. See (Lee & Ray, 2019; Brown, 2015).'],
    [1, 'References', 'Brown, T. (2015). Old findings. Journal of Old Things, 2(1), 1-9.\nJones, K. (2018). Other. Journal, 3(2), 10-20.\nLee, M., & Ray, T. (2019). Joint work. Journal, 4(1), 5-8.\nSmith, J. (2020). A study. Journal, 1(1), 1-5.'],
  ]),
  'APA-shaped list, many faults': withOutline([
    [1, 'Introduction', 'As Smith (2020) argues, and However, Jones et al. (2018) agree. Also (see Lee, 2019), (Brown, 2015) and (Zed, 2001). Plain (Figure 2) and (in 2020) stay quiet.'],
    [1, 'Bibliography', 'Smith, J. 2020. A study. Journal\n[2] Jones, K., and Lee, M. (2018). Two authors. Journal, 3(2), 10-20\nJohn Brown. (2015). Wrong name order. Journal.\nWorld Health Organization. (2020). A report. WHO Press.\nWhite, P. (2010) Missing the full stop after the year. Journal.\nAbel, C. (2001). Out of order entry. https://example.org/abel'],
  ]),
  'MLA-shaped list, all matching': withOutline([
    [1, 'Body', 'As argued (Smith 45) and (Jones and Lee 12-14), also (Ray et al. 7), (Figure 2) and (Firebase).'],
    [1, 'Works Cited', 'Jones, Kim, and Mia Lee. "Two authors." Journal, vol. 3, 2018, pp. 1-9.\nRay, Tom, et al. "Many authors." Journal, 2019.\nSmith, John. "A study." Journal, 2020.'],
  ]),
  'MLA-shaped list, many faults': withOutline([
    [1, 'Body', 'See (Brown 7), (Smith 3–10), (Van der Berg 12), (Figure 2) and (Python 3) here.'],
    [1, 'References', 'Smith, J. A study without quotes. Journal, 2020\nWhite, Pat. "Unused." Journal, 2010.\n[3] Abel, Cain. "Numbered." Journal, 2001.\nvan der Berg, Anna. "Lowercase surname." Journal, 2015.\nAdams, Bob. "Out of order." Journal, 1999.'],
  ]),
  'IEEE-shaped list, all matching': withOutline([
    [1, 'Introduction', 'We build on [1], then [2, 3] and finally [4-5].'],
    [1, 'References', '[1] A. Author, "Title one," Journal, vol. 1, no. 2, pp. 3-4, 2020.\n[2] B. C. Writer, "Title two," in Proc. Conf., pp. 5-6, 2019.\n[3] C. Person, "Title three," Journal, vol. 3, pp. 7-8, 2018. [Online]. Available: https://example.org\n[4] D. Other, "Title four," arXiv, 2017.\n[5] E. Fifth, "Title five," Journal, vol. 9, pp. 1-2, 2016, doi: 10.1000/xyz'],
  ]),
  'IEEE-shaped list, cited out of order, many faults': withOutline([
    [1, 'Introduction', 'First [3] then [1], next [4], [2] and [9]. Again [3].'],
    [1, 'Bibliography', '[1] Smith, J., A study of things. Journal of Stuff\n2. Jones K., "Numbered with a dot," Journal, 2019.\n[3] C. Person, "No details," 2018.\n[4] D. Other, Title without quotation marks, Journal, vol. 1, 2017.\n[5] E. Fifth, "Never cited," Journal, vol. 9, 2016.'],
  ]),
  'unaccented and accented names': withOutline([
    [1, 'Body', 'Work by Müller (2020) and (García, 2019), also (O’Neil, 2018) and (Müller 12).'],
    [1, 'References', 'García, M. (2019). Título \u{1F600} con emoji. Revista, 1(1), 1-2.\nMüller, J. (2020). Titel. Zeitschrift, 2(2), 3-4.\nO’Neil, P. (2018). Title. Journal, 5(1), 9-10.'],
  ]),
  'colon and number on the list heading': withOutline([
    [1, 'Body', 'Cited (Smith, 2020) here.'],
    [1, '7. References:', 'Smith, J. (2020). A study of things. Journal, 1(1), 1-5.'],
  ]),
  'only some citations, list unnumbered': withOutline([
    [1, 'Body', 'Only (Smith, 2020; Jones, 2018) here, and (2019) alone, and (Lee, 2019a).'],
    [1, 'References', 'Smith, J. (2020). A study. Journal.\nJones, K. (2018). Other. Journal.\nLee, M. (2019a). First. Journal.\nLee, M. (2019b). Second. Journal.\nKing, A. (n.d.). A page. Website.'],
  ]),
  'reference list with nothing in the body': withOutline([
    [1, 'Body', 'No citations at all in this body text.'],
    [1, 'References', 'Smith, J. (2020). A study. Journal.\nJones, K. (2018). Other. Journal.'],
  ]),
  'empty reference list': withOutline([[1, 'Body', 'Some text (Smith, 2020).'], [1, 'References', '']]),
  'no reference list at all': plain('Only body text (Smith, 2020) and [1] and (Smith 4) here, nothing else.'),
};
for (const [name, doc] of Object.entries(styleDocuments)) {
  for (const style of ['APA', 'MLA', 'IEEE', 'ieee', 'Chicago', '']) {
    cases.push({ name: `${name} under ${style || 'no style'}`, ...doc, kind: 'Other', style });
  }
}

/* ---- seeded random documents ---- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = [
  ['budget', 'software', 'licence'], ['survey', 'students', 'library'], ['scheduling', 'system', 'patients'],
  ['model', 'training', 'accuracy'], ['contract', 'payment', 'schedule'], ['campus', 'network', 'coverage'],
  ['clinic', 'waiting', 'time'], ['harvest', 'wheat', 'yield'],
];
const UNITS = ['PKR', 'USD', '$', 'percent', '%', 'students', 'days', 'hours', 'metres', 'patients', ''];
const NEGATIONS = ['not', 'never', 'no longer', 'cannot'];
const EXTRA_WORDS = ['carefully', 'quickly', 'annually', 'overall', 'again', 'clearly', 'at the university', 'in the north region'];
const HEADINGS = [
  'Abstract', 'Summary', 'Introduction', 'Overview', 'Literature Review', 'Related Work', 'Background', 'Methodology', 'Methods',
  'Approach', 'Results', 'Findings', 'Evaluation', 'Discussion', 'Analysis', 'Conclusion', 'References', 'Recommendations',
  'Parties', 'Definitions', 'Scope', 'Obligations', 'Termination', 'Governing Law', 'Timeline', 'Appendix',
  '1. Introduction', '2. Methods', '3. Results', 'Study Design', 'Budget',
];
const KINDS = ['Thesis', 'Research paper', 'Report', 'Legal', 'Other'];

function sentence(rand, topic) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const words = [...topic];
  if (rand() < 0.5) words.push(pick(EXTRA_WORDS));
  let body = `The ${words.join(' ')} ${pick(['was', 'is', 'remained', 'reached', 'stayed'])}`;
  if (rand() < 0.25) body += ` ${pick(NEGATIONS)}`;
  if (rand() < 0.7) {
    const value = rand() < 0.3 ? (rand() * 100).toFixed(1) : String(Math.floor(rand() * 90000) + 10);
    const shown = rand() < 0.3 && value.length > 3 && !value.includes('.') ? Number(value).toLocaleString('en-US') : value;
    const unit = pick(UNITS);
    body += unit === '$' || unit === 'PKR' || unit === 'USD' ? ` ${unit} ${shown}` : ` ${shown} ${unit}`.trimEnd();
  } else {
    body += ` ${pick(EXTRA_WORDS)}`;
  }
  if (rand() < 0.2) {
    const pickN = () => 1 + Math.floor(rand() * 6);
    const style = rand();
    body += style < 0.7 ? ` [${pickN()}]` : style < 0.8 ? ` [${pickN()}, ${pickN()}]` : style < 0.9 ? ` [${pickN()}-${pickN()}]` : ` [${pickN()}–${pickN()}]`;
  }
  if (rand() < 0.15) body += ` \u{1F600}`;
  if (rand() < 0.1) body += ' café';
  return `${body}.`;
}

function randomDocument(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const topics = [pick(TOPICS), pick(TOPICS)];
  const paragraphs = () => {
    const count = 1 + Math.floor(rand() * 4);
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const topic = rand() < 0.6 ? topics[0] : rand() < 0.5 ? topics[1] : pick(TOPICS);
      parts.push(sentence(rand, topic));
    }
    if (rand() < 0.2) parts.push(parts[Math.floor(rand() * parts.length)]);
    return parts.join(' ');
  };
  if (rand() < 0.3) return plain(Array.from({ length: 1 + Math.floor(rand() * 5) }, paragraphs).join('\n\n'));
  const sections = 2 + Math.floor(rand() * 7);
  const parts = [];
  const numberHeadings = rand() < 0.4;
  let counter = 0;
  for (let i = 0; i < sections; i += 1) {
    const level = rand() < 0.75 ? 1 : 1 + Math.floor(rand() * 4);
    let title = pick(HEADINGS);
    if (numberHeadings) {
      const odd = rand();
      counter = odd < 0.1 ? counter + 2 : odd < 0.18 ? counter : odd < 0.24 ? Math.max(1, counter - 1) : counter + 1;
      title = `${counter}. ${title.replace(/^\d+\.\s*/, '')}`;
    }
    let body = rand() < 0.2 ? '' : paragraphs();
    if (rand() < 0.2) {
      const items = ['Mix', 'Add', 'Stir', 'Bake', 'Cool', 'Serve'].slice(0, 3 + Math.floor(rand() * 3));
      let n = 0;
      body += `\n${items.map((item) => { n = rand() < 0.15 ? n + 2 : rand() < 0.08 ? n : n + 1; return `${n}. ${item} it`; }).join('\n')}`;
    }
    parts.push([level, title, body]);
  }
  if (rand() < 0.45) {
    const count = 1 + Math.floor(rand() * 6);
    let n = 0;
    const entries = Array.from({ length: count }, () => {
      n = rand() < 0.1 ? n + 2 : n + 1;
      const year = rand() < 0.25 ? '' : `, ${1990 + Math.floor(rand() * 35)}`;
      return `[${n}] ${pick(['A. Author', 'B. Writer', 'C. Person'])}, "${pick(['A study', 'Another study', 'Notes'])}," ${pick(['Journal', 'Proceedings'])}${year}.`;
    });
    parts.push([1, pick(['References', 'Bibliography', '9. References', 'Works Cited:', 'Sources']), rand() < 0.15 ? 'Smith and Jones did it' : entries.join('\n')]);
  }
  return withOutline(parts);
}

const SEED = 20260927;
const COUNT = 400;
const rand = mulberry32(SEED);
for (let i = 0; i < COUNT; i += 1) {
  const doc = randomDocument(rand);
  cases.push({ name: `random #${i + 1} (seed ${SEED})`, ...doc, kind: KINDS[Math.floor(rand() * KINDS.length)] });
}

/* ---- seeded random documents built around a reference list in one of the styles ---- */

const SURNAMES = ['Smith', 'Jones', 'Lee', 'Brown', 'García', 'Müller', 'O’Neil', 'Van der Berg', 'Wang', 'Ali', 'Abel', 'Zed'];
const GIVEN = ['John', 'Kim', 'Mia', 'Pat', 'Tom'];
const INITIALS = ['J.', 'K. L.', 'M.', 'P.', 'T. R.'];
const TITLES = ['A study of things', 'Another study', 'Notes on method', 'Field results \u{1F600}', 'Café habits'];
const VENUES = ['Journal of Stuff', 'Proceedings', 'Review', 'Annals'];
const LIST_HEADINGS = ['References', 'References', 'Works Cited', 'Bibliography', 'References:', '7. References', 'Sources'];

function randomStyleDocument(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const style = pick(['APA', 'APA', 'MLA', 'MLA', 'IEEE', 'IEEE', 'apa', '']);
  const shape = pick(['APA', 'MLA', 'IEEE', 'IEEE']); // what the entries are actually written as
  const count = 2 + Math.floor(rand() * 5);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const surname = pick(SURNAMES);
    const year = 1995 + Math.floor(rand() * 30);
    const letter = rand() < 0.1 ? 'a' : '';
    const title = pick(TITLES);
    const venue = pick(VENUES);
    const pages = `${1 + Math.floor(rand() * 90)}-${100 + Math.floor(rand() * 90)}`;
    let text;
    if (shape === 'APA') {
      const authors = rand() < 0.2 ? `${surname}, ${pick(INITIALS)}, and ${pick(SURNAMES)}, ${pick(INITIALS)}` : `${surname}, ${pick(INITIALS)}`;
      const when = rand() < 0.15 ? `${year}.` : `(${year}${letter}).`;
      text = `${authors} ${when} ${title}. ${venue}, ${1 + Math.floor(rand() * 9)}(${1 + Math.floor(rand() * 4)}), ${pages}${rand() < 0.15 ? '' : '.'}`;
      if (rand() < 0.12) text = `[${i + 1}] ${text}`;
    } else if (shape === 'MLA') {
      const name = rand() < 0.15 ? `${pick(GIVEN)} ${surname}` : `${surname}, ${pick(GIVEN)}`;
      text = `${name}. "${title}." ${venue}, vol. ${1 + Math.floor(rand() * 9)}, ${year}, pp. ${pages}${rand() < 0.15 ? '' : '.'}`;
      if (rand() < 0.12) text = `[${i + 1}] ${text}`;
    } else {
      const author = rand() < 0.15 ? `${surname}, ${pick(INITIALS)}` : `${pick(INITIALS)} ${surname}`;
      const quoted = rand() < 0.85 ? `"${title},"` : `${title},`;
      const details = rand() < 0.8 ? ` ${venue}, vol. ${1 + Math.floor(rand() * 9)}, pp. ${pages},` : '';
      text = `${rand() < 0.1 ? `${i + 1}.` : `[${i + 1}]`} ${author}, ${quoted}${details} ${year}${rand() < 0.15 ? '' : '.'}`;
    }
    entries.push({ surname, year, text, other: pick(SURNAMES) });
  }
  const sorted = rand() < 0.6;
  const listed = sorted && shape !== 'IEEE'
    ? [...entries].sort((a, b) => a.surname.toLowerCase().localeCompare(b.surname.toLowerCase(), 'en'))
    : entries;

  const sentences = [];
  for (const entry of entries) {
    if (rand() < 0.2) continue; // left uncited
    const index = entries.indexOf(entry) + 1;
    const form = pick(['paren', 'narrative', 'pair', 'mla', 'number', 'etal', 'ampersand']);
    if (form === 'paren') sentences.push(`This is shown (${entry.surname}, ${entry.year}).`);
    else if (form === 'narrative') sentences.push(`${entry.surname} (${entry.year}) argues the same.`);
    else if (form === 'pair') sentences.push(`${entry.surname} and ${entry.other} (${entry.year}) agree.`);
    else if (form === 'mla') sentences.push(`This is shown (${entry.surname} ${1 + Math.floor(rand() * 90)}).`);
    else if (form === 'number') sentences.push(`This is shown [${index}].`);
    else if (form === 'etal') sentences.push(`${entry.surname} et al. (${entry.year}) agree.`);
    else sentences.push(`Also (see ${entry.surname} & ${entry.other}, ${entry.year}; ${pick(SURNAMES)}, ${1990 + Math.floor(rand() * 30)}).`);
  }
  if (rand() < 0.3) sentences.push('Then (Figure 3), (Table 2), (Firebase) and (in 2020) stay quiet.');
  if (rand() < 0.3) sentences.push(`Missing (Nobody, ${1990 + Math.floor(rand() * 30)}) and [${count + 3}] appear here.`);
  if (rand() < 0.25) sentences.push(`Lead in: However, ${pick(SURNAMES)} (${1990 + Math.floor(rand() * 30)}) disagrees; as ${pick(SURNAMES)} (${1990 + Math.floor(rand() * 30)}) notes.`);
  if (rand() < 0.2) sentences.reverse();

  const doc = withOutline([
    [1, pick(['Introduction', '1. Introduction']), sentences.join(' ')],
    [1, pick(LIST_HEADINGS), listed.map((entry) => entry.text).join('\n')],
    ...(rand() < 0.15 ? [[1, 'Appendix', 'Extra text (Late, 2001) after the list.']] : []),
  ]);
  return { ...doc, style };
}

const STYLE_COUNT = 300;
const styleRand = mulberry32(SEED + 1);
for (let i = 0; i < STYLE_COUNT; i += 1) {
  const doc = randomStyleDocument(styleRand);
  cases.push({ name: `random reference list #${i + 1} (seed ${SEED + 1})`, ...doc, kind: 'Other' });
}

export default cases;
