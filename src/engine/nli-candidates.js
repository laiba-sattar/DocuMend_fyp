/**
 * nli-candidates.js — which sentence pairs are worth an NLI forward pass.
 *
 * A transformer forward pass is too slow to run on every pair of sentences in
 * a long document, so this picks a short list first: pairs that are about the
 * same thing (their embeddings are close) but are not already a near-verbatim
 * repeat (the lexical checks in fallback.js / rules.rs already catch those),
 * and are not a pair those same checks already turned into an issue.
 *
 * Pure math, no model: this file never imports Transformers.js, so it can be
 * tested with hand-built embedding vectors and no network at all (see
 * scripts/nli-candidates.test.mjs).
 */

/**
 * Similarity below this is not the same topic at all. Started at 0.55 on a
 * guess; a real contradictory pair on the same topic ("employees may work
 * from home three days a week" vs "full remote work is not permitted")
 * scored only ~0.38 with all-MiniLM-L6-v2 — average-pooled sentence
 * embeddings compress topically-related-but-differently-worded sentences
 * more than expected. Lowered so the classifier (which has its own
 * confidence floor) sees more candidates rather than the embedding filter
 * silently throwing away the real ones.
 */
export const DEFAULT_SIM_LOW = 0.15;
/** Similarity at or above this is a near-duplicate — repetition() already covers it. */
export const DEFAULT_SIM_HIGH = 0.92;
/** How many candidates to keep, at most, before they even reach the classifier. */
export const DEFAULT_CANDIDATE_CAP = 40;

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** The index of the sentence containing `offset`, or -1. */
function sentenceIndexAt(sentences, offset) {
  return sentences.findIndex((s) => offset >= s.start && offset < s.end);
}

const pairKey = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);

/**
 * The sentence-index pairs the deterministic pass already turned into a
 * contradiction or redundancy issue — no point spending a forward pass
 * reconfirming what a lexical check already found.
 */
export function alreadyResolvedPairs(sentences, deterministicIssues) {
  const resolved = new Set();
  for (const issue of deterministicIssues ?? []) {
    if (issue.kind !== 'contradiction' && issue.kind !== 'redundancy') continue;
    const a = sentenceIndexAt(sentences, issue.start);
    if (a < 0) continue;
    for (const span of issue.related ?? []) {
      const b = sentenceIndexAt(sentences, span.start);
      if (b < 0 || b === a) continue;
      resolved.add(pairKey(a, b));
    }
  }
  return resolved;
}

/**
 * Ranks every sentence pair by embedding similarity and keeps the ones worth
 * classifying: related but not verbatim, and not already resolved lexically.
 *
 *   selectCandidates({ sentences, embeddings, deterministicIssues })
 *
 * `embeddings[i]` is the vector for `sentences[i]`. Returns
 * `[{ aIndex, bIndex, similarity }]`, most similar first, capped at `cap`.
 */
export function selectCandidates({
  sentences,
  embeddings,
  deterministicIssues = [],
  simLow = DEFAULT_SIM_LOW,
  simHigh = DEFAULT_SIM_HIGH,
  cap = DEFAULT_CANDIDATE_CAP,
}) {
  const resolved = alreadyResolvedPairs(sentences, deterministicIssues);
  const candidates = [];
  for (let i = 0; i < sentences.length; i += 1) {
    for (let j = i + 1; j < sentences.length; j += 1) {
      if (resolved.has(pairKey(i, j))) continue;
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity < simLow || similarity > simHigh) continue;
      candidates.push({ aIndex: i, bIndex: j, similarity });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, cap);
}
