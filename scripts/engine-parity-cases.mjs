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
];

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
  for (let i = 0; i < sections; i += 1) {
    const level = rand() < 0.75 ? 1 : 1 + Math.floor(rand() * 4);
    parts.push([level, pick(HEADINGS), rand() < 0.2 ? '' : paragraphs()]);
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

export default cases;
