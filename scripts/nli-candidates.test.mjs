/**
 * nli-candidates.test.mjs — the pure candidate-selection math for S7, tested
 * with hand-built embedding vectors. No model, no network: `nli-candidates.js`
 * never imports Transformers.js, so this only ever exercises cosine
 * similarity, the similarity band, the cap, and the de-dup against issues the
 * deterministic checks already raised.
 *
 *   node --test scripts/nli-candidates.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadyResolvedPairs, selectCandidates } from '../src/engine/nli-candidates.js';

/** A 2D unit vector whose cosine similarity to [1, 0] is exactly `sim`. */
function unit(sim) {
  return [sim, Math.sqrt(Math.max(0, 1 - sim * sim))];
}

const sentence = (index, start, end) => ({ index, start, end, text: `sentence ${index}` });

test('keeps a pair in the related-but-not-verbatim band', () => {
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const embeddings = [unit(1), unit(0.7)]; // similarity 0.7
  const candidates = selectCandidates({ sentences, embeddings });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].aIndex, 0);
  assert.equal(candidates[0].bIndex, 1);
});

test('drops a pair that is nearly identical — repetition() already covers that', () => {
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const embeddings = [unit(1), unit(0.99)];
  const candidates = selectCandidates({ sentences, embeddings });
  assert.equal(candidates.length, 0);
});

test('drops a pair that is not about the same thing at all', () => {
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const embeddings = [unit(1), unit(0.1)];
  const candidates = selectCandidates({ sentences, embeddings });
  assert.equal(candidates.length, 0);
});

test('drops a pair the deterministic pass already turned into an issue', () => {
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const embeddings = [unit(1), unit(0.8)]; // otherwise squarely in-band
  const deterministicIssues = [
    { kind: 'contradiction', start: 0, related: [{ start: 11 }] },
  ];
  const candidates = selectCandidates({ sentences, embeddings, deterministicIssues });
  assert.equal(candidates.length, 0);
});

test('a structure or citation issue does not count as already-resolved', () => {
  // Only contradiction/redundancy findings mean "an NLI pass would be redundant here."
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const embeddings = [unit(1), unit(0.8)];
  const deterministicIssues = [
    { kind: 'structure', start: 0, related: [{ start: 11 }] },
  ];
  const candidates = selectCandidates({ sentences, embeddings, deterministicIssues });
  assert.equal(candidates.length, 1);
});

test('keeps the highest-similarity candidates when there are more than the cap', () => {
  const sentences = [0, 1, 2, 3].map((i) => sentence(i, i * 20, i * 20 + 10));
  const embeddings = [unit(1), unit(0.9), unit(0.8), unit(0.6)];
  const candidates = selectCandidates({ sentences, embeddings, cap: 2 });
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0].similarity >= candidates[1].similarity);
});

test('alreadyResolvedPairs maps issue offsets back to sentence indices', () => {
  const sentences = [sentence(0, 0, 10), sentence(1, 11, 21)];
  const issues = [{ kind: 'redundancy', start: 2, related: [{ start: 15 }] }];
  const resolved = alreadyResolvedPairs(sentences, issues);
  assert.ok(resolved.has('0-1'));
});
