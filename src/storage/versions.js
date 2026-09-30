/**
 * versions.js — saved copies of a document over time (PB-07).
 *
 * Two kinds:
 *   - "auto":   taken by the editor at most every 10 minutes while you write
 *   - "manual": a named snapshot you create on the Version history page
 *
 * Each version stores a full copy of the document's content, so restoring
 * one never depends on any other version.
 */
import { db, newId } from './db';
import { getDocument, updateDocument } from './documents';
// How many automatic versions to keep per document is a plan limit now:
// 10 on Basic, 50 on Premium, 200 on Enterprise. Versions a writer saved by
// hand are never pruned, whatever the plan.
import { autoVersionsKept } from '../plans/limits';

const AUTO_EVERY_MS = 10 * 60 * 1000; // at most one auto version per 10 minutes

/** Newest first. */
export async function listVersions(docId) {
  if (!docId) return [];
  return db.versions.where('docId').equals(docId).reverse().sortBy('createdAt');
}

/** Copies the document as it is right now into a new version. */
export async function createVersion(docId, { kind = 'manual', label = '', note = '' } = {}) {
  const doc = await getDocument(docId);
  if (!doc) throw new Error('Document not found');
  const existing = await db.versions.where('docId').equals(docId).toArray();
  const number = existing.reduce((max, v) => Math.max(max, v.number ?? 0), 0) + 1;
  const version = {
    id: newId(),
    docId,
    number, // shown as v1, v2, …
    kind,
    label: label.trim(),
    note: note.trim(),
    content: doc.content ?? '',
    wordCount: doc.wordCount ?? 0,
    createdAt: Date.now(),
  };
  await db.versions.add(version);
  if (kind === 'auto') await pruneAutoVersions(docId);
  return version;
}

/** Called by the editor after each save; takes an auto version only when enough time has passed and the text changed. */
export async function maybeAutoVersion(docId) {
  const doc = await getDocument(docId);
  if (!doc || !doc.content) return null;
  const [latest] = await listVersions(docId);
  if (latest && Date.now() - latest.createdAt < AUTO_EVERY_MS) return null;
  if (latest && latest.content === doc.content) return null;
  return createVersion(docId, { kind: 'auto' });
}

/**
 * Puts an old version back as the document's current text.
 * The current text is saved as a version first, so a restore can always be undone.
 */
export async function restoreVersion(version) {
  const doc = await getDocument(version.docId);
  if (!doc) throw new Error('Document not found');
  if ((doc.content ?? '') !== version.content) {
    await createVersion(version.docId, { kind: 'auto', label: `Before restoring v${version.number}` });
  }
  await updateDocument(version.docId, { content: version.content, wordCount: version.wordCount });
}

export function deleteVersion(id) {
  return db.versions.delete(id);
}

/** Keeps only the newest autoVersionsKept() auto versions of one document. */
async function pruneAutoVersions(docId) {
  const autos = (await listVersions(docId)).filter((v) => v.kind === 'auto');
  const extra = autos.slice(autoVersionsKept()).map((v) => v.id);
  if (extra.length) await db.versions.bulkDelete(extra);
}

/** Deletes auto versions older than the given age; named snapshots stay. Returns how many were removed. */
export async function deleteOldAutoVersions(olderThanMs) {
  const cutoff = Date.now() - olderThanMs;
  const old = await db.versions.filter((v) => v.kind === 'auto' && v.createdAt < cutoff).toArray();
  await db.versions.bulkDelete(old.map((v) => v.id));
  return old.length;
}
