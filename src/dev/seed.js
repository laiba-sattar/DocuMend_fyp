/**
 * seed.js — development only. Builds a ready-made sample document in the
 * browser you are using, so a feature can be seen without typing test text.
 *
 *   http://localhost:5173/?seed=numbering-test
 *   http://localhost:5173/?seed=citation-style-test
 *
 * Nothing here ships: main.jsx imports it behind `import.meta.env.DEV`, so a
 * production build contains none of it. Visiting the address again replaces the
 * sample with a fresh copy, which is what you want after trying a repair.
 */
import { createDocument, deleteDocument, listDocuments, updateDocument } from '../storage/documents';
import { countWords } from '../storage/format';

const SAMPLES = {
  // Every mistake the numbering and reference checks look for, on purpose.
  'numbering-test': {
    title: 'Sample: numbering and references',
    type: 'Other',
    html: [
      '<h1>1. Introduction</h1>',
      '<p>Earlier work [1] and later work [4] shows this clearly.</p>',
      '<h1>3. Methods</h1>',
      '<p>We surveyed students at the university. The steps were:</p>',
      '<p>1. Mix the flour.</p>',
      '<p>2. Add the water.</p>',
      '<p>4. Bake it.</p>',
      '<h1>References</h1>',
      '<p>[1] A. Author, "Title one," Journal, 2020.</p>',
      '<p>[2] B. Writer, "Title two," Journal.</p>',
    ].join(''),
  },

  // An APA document with faults in the reference list. Switch the style in the
  // review panel to MLA or IEEE to see the same list judged by another standard.
  'citation-style-test': {
    title: 'Sample: citation style',
    type: 'Other',
    citationStyle: 'APA',
    html: [
      '<h1>Introduction</h1>',
      '<p>As Smith (2020) argues, earlier work (Jones, 2018) agrees. Others disagree (Brown, 2015; Zed, 2001).</p>',
      '<h1>Bibliography</h1>',
      '<p>Smith, J. 2020. A study of things. Journal of Stuff</p>',
      '<p>Jones, K., and Lee, M. (2018). Two authors. Journal, 3(2), 10-20.</p>',
      '<p>Brown, T. (2015). Old findings. Journal of Old Things, 2(1), 1-9.</p>',
      '<p>White, P. (2010). Never cited. Journal, 1(1), 1-5.</p>',
    ].join(''),
  },
};

/** Builds the named sample and opens it. Returns true when the page is being redirected. */
export async function runSeed(name) {
  const sample = SAMPLES[name];
  if (!sample) {
    console.warn(`[seed] unknown sample "${name}". Known: ${Object.keys(SAMPLES).join(', ')}`);
    return false;
  }
  const old = (await listDocuments()).find((doc) => doc.title === sample.title);
  if (old) await deleteDocument(old.id);
  const doc = await createDocument({ title: sample.title, type: sample.type });
  await updateDocument(doc.id, {
    content: sample.html,
    wordCount: countWords(sample.html.replace(/<[^>]+>/g, ' ')),
    citationStyle: sample.citationStyle ?? '',
  });
  window.location.replace(`/editor?doc=${encodeURIComponent(doc.id)}&review=1`);
  return true;
}
