/**
 * nli.js — the on-device model that reads meaning, not just words (S7).
 *
 * The deterministic checks (Rust or its JavaScript twin in fallback.js) only
 * catch a contradiction when both sentences share real vocabulary. Two small
 * models close that gap:
 *   - a sentence embedder, so sentences about the same thing can be found
 *     even without shared words (nli-candidates.js ranks the pairs);
 *   - an NLI classifier, run only on that short candidate list, to judge
 *     whether a pair actually disagrees.
 *
 * Both are loaded lazily, only once the reader has switched this on in
 * Settings — together they are a multi-ten-megabyte download, so nothing
 * fetches them until asked to. Runs inside the engine's Web Worker (see
 * worker.js), never on the page, so typing is never affected. Strictly
 * additive: the deterministic engine has already answered before this ever
 * starts, and this only ever adds issues, never removes or replaces them.
 */
import { splitSentences } from './fallback';
import { selectCandidates } from './nli-candidates';

/** More sentences than this and the O(n^2) pairing would cost too much latency. */
const MAX_NLI_SENTENCES = 200;
/** However many candidates pass the similarity band, report at most this many. */
const MAX_NLI_ISSUES = 10;
/** Below this, the model is not confident enough to call it a contradiction. */
const CONTRADICTION_FLOOR = 0.70;
/**
 * NLI classifiers run overconfident; a raw "contradiction wins" is not
 * enough. This is the gap "contradiction" must beat the best of the other
 * two labels by — a close three-way call is exactly the miscalibration this
 * guards against.
 */
const CONTRADICTION_MARGIN = 0.30;

const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
const NLI_MODEL = 'Xenova/nli-deberta-v3-xsmall';

let pipelinesPromise = null;

/**
 * The NLI model is loaded as a raw tokenizer + model, not through
 * `pipeline('text-classification', …)` — that pipeline only ever scores one
 * piece of text at a time and has no way to hand it a premise *and* a
 * hypothesis, which is the whole point of NLI. Calling it with `text_pair`
 * (as an earlier version of this file did) is silently accepted but never
 * actually compares the two sentences, so nothing ever crossed the
 * confidence threshold — the tokenizer itself is what accepts a pair
 * (`tokenizer(a, { text_pair: b })`), so the model has to be driven directly.
 */
async function loadPipelines(onProgress) {
  const { pipeline, AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@xenova/transformers');
  // `allowLocalModels` auto-detects "am I in a browser?" by looking for
  // `window`, which does not exist inside a Web Worker — so without this the
  // library decides it is *not* in a browser and tries a local `/models/…`
  // path on this app's own origin instead of the Hugging Face Hub.
  env.allowLocalModels = false;
  const embedder = await pipeline('feature-extraction', EMBED_MODEL, { progress_callback: onProgress });
  const nliTokenizer = await AutoTokenizer.from_pretrained(NLI_MODEL, { progress_callback: onProgress });
  const nliModel = await AutoModelForSequenceClassification.from_pretrained(NLI_MODEL, { progress_callback: onProgress });
  return { embedder, nliTokenizer, nliModel };
}

/** Loads the two models the first time this is called; every call after reuses them. */
export function ensurePipelines(onProgress) {
  pipelinesPromise ??= loadPipelines(onProgress).catch((error) => {
    pipelinesPromise = null; // a failed load should not wedge every future attempt
    throw error;
  });
  return pipelinesPromise;
}

/** Whether the models have already been asked for, successfully or not. */
export function pipelinesRequested() {
  return pipelinesPromise !== null;
}

async function embedSentences(embedder, sentences) {
  const vectors = [];
  for (const sentence of sentences) {
    // eslint-disable-next-line no-await-in-loop -- each call needs the last one's result before starting the next
    const output = await embedder(sentence.text, { pooling: 'mean', normalize: true });
    vectors.push(Array.from(output.data));
  }
  return vectors;
}

const label = (sentence) => `Sentence ${sentence.index + 1}`;

/** A numerically stable softmax over a plain array of logits. */
function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((sum, x) => sum + x, 0);
  return exps.map((x) => x / total);
}

/**
 * Scores one candidate pair and turns it into an Issue if the model is
 * confident the two disagree. `repairs` is always empty, the same as the
 * lexical claim-conflict check: a human has to decide which version is true,
 * more so here since this is a probabilistic call, not an exact rule.
 */
async function classifyPair(tokenizer, model, a, b) {
  const inputs = await tokenizer(a.text, { text_pair: b.text, truncation: true });
  const { logits } = await model(inputs);
  const probs = softmax(Array.from(logits.data));
  const id2label = model.config.id2label ?? {};
  const byLabel = {};
  probs.forEach((p, i) => { byLabel[String(id2label[i] ?? i).toLowerCase()] = p; });

  const contradiction = byLabel.contradiction ?? 0;
  const next = Math.max(byLabel.entailment ?? 0, byLabel.neutral ?? 0);
  if (contradiction < CONTRADICTION_FLOOR || contradiction - next < CONTRADICTION_MARGIN) return null;
  return {
    id: `nli-${a.start}-${b.start}`,
    kind: 'contradiction',
    title: 'Claims may disagree',
    message: `${label(a)} and ${label(b).toLowerCase()} may be saying opposite things, even though they don’t share the same words. A small on-device model flagged this — worth a second look before trusting it.`,
    severity: 'medium',
    location: `${label(a)} · ${label(b)}`,
    start: a.start,
    end: a.end,
    related: [{ start: b.start, end: b.end }],
    repairs: [],
    suggestion: null,
    outline: [],
  };
}

/**
 * Runs the NLI pass over a document, given the deterministic issues already
 * found (so it can skip pairs those checks already resolved).
 *
 *   const issues = await runNli(text, deterministicIssues, { onProgress, isStale });
 *
 * `isStale()`, if given, is checked between the slow steps (embedding, each
 * classification) so a pass superseded by a newer keystroke can stop early
 * instead of finishing a scan for a document the writer already changed.
 */
export async function runNli(text, deterministicIssues, { onProgress, isStale } = {}) {
  const { embedder, nliTokenizer, nliModel } = await ensurePipelines(onProgress);
  if (isStale?.()) return [];

  const sentences = splitSentences(text).slice(0, MAX_NLI_SENTENCES);
  if (sentences.length < 2) return [];

  const embeddings = await embedSentences(embedder, sentences);
  if (isStale?.()) return [];

  const candidates = selectCandidates({ sentences, embeddings, deterministicIssues });
  const issues = [];
  for (const candidate of candidates) {
    if (isStale?.() || issues.length >= MAX_NLI_ISSUES) break;
    // eslint-disable-next-line no-await-in-loop -- classifying one pair at a time keeps the worker responsive to a newer request
    const issue = await classifyPair(nliTokenizer, nliModel, sentences[candidate.aIndex], sentences[candidate.bIndex]);
    if (issue) issues.push(issue);
  }
  return issues;
}
