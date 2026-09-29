/**
 * nliModelCache.js — how big the downloaded NLI models are, and how to
 * remove them. Shared by Settings (the download/delete card) and Storage
 * (the storage breakdown), so both read the same number.
 *
 * Transformers.js keeps every model file it downloads in the browser's own
 * Cache Storage rather than IndexedDB, under a cache name it manages itself
 * (its default starts with "transformers-cache"). This reads and clears that
 * cache without needing to know the model files' own names, so it keeps
 * working if the exact checkpoints in nli.js ever change.
 *
 * Not verified against a real download in this environment — worth
 * confirming once, in the browser's own DevTools (Application → Cache
 * Storage), that a cache matching this prefix actually appears and holds the
 * model files, before relying on the byte count this reports.
 */
const CACHE_PREFIX = 'transformers-cache';

async function modelCaches() {
  if (typeof caches === 'undefined') return [];
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(CACHE_PREFIX));
}

/** Total bytes the downloaded NLI models take up right now (0 before the first download). */
export async function nliModelBytes() {
  const names = await modelCaches();
  let total = 0;
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- a handful of caches at most, and each open is quick
    const cache = await caches.open(name);
    // eslint-disable-next-line no-await-in-loop
    const requests = await cache.keys();
    for (const request of requests) {
      // eslint-disable-next-line no-await-in-loop -- reading one entry at a time keeps memory bounded for a large model
      const response = await cache.match(request);
      // eslint-disable-next-line no-await-in-loop
      const blob = await response?.blob();
      if (blob) total += blob.size;
    }
  }
  return total;
}

/** Deletes every cached NLI model file, freeing the space Settings offered to reclaim. */
export async function deleteNliModels() {
  const names = await modelCaches();
  await Promise.all(names.map((name) => caches.delete(name)));
}
