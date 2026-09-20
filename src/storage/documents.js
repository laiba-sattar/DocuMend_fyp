/**
 * documents.js — every read and write of a document goes through here.
 *
 * Pages never touch db.documents directly. Keeping all writes in one file
 * means the encryption layer (section S3) can be added here later without
 * changing any page.
 */
import { db, newId } from './db';
import { requestPersistentStorage } from './quota';
import { queueDelete, queueUpsert } from '../sync/metadata';
import { assertCanCreateDocument } from '../plans/limits';

/** The Create document screen asks for a type; My documents filters by category. */
const CATEGORY_BY_TYPE = {
  Thesis: 'Academic',
  'Research paper': 'Researcher',
  Legal: 'Legal',
  Report: 'Corporate',
  Other: 'Draft',
};

/**
 * The types a document can be, in the order they are offered.
 *
 * One list, exported, because three screens need it: "Create document", the
 * Settings page, and the editor's own type picker. When it lived in each of
 * them separately, a type added in one place was a type the engine had no
 * template for in another.
 */
export const DOCUMENT_TYPES = Object.keys(CATEGORY_BY_TYPE);

const TINTS = ['saffron', 'sage', 'coral', 'lavender', 'sky', 'gold'];

export async function createDocument({
  title,
  type = 'Other',
  folderId = 'root',
  checks = [],
  /**
   * 'created' — started here on a blank page.
   * 'imported' — brought in from a file on the device.
   * The library separates the two, and nothing else could tell them apart:
   * an imported .docx and a new document looked identical in the record.
   */
  source = 'created',
}) {
  // The plan's document limit is real, and this is where it is real. Throws a
  // message meant to be shown to the reader (see plans/limits.js).
  await assertCanCreateDocument();

  const now = Date.now();
  const doc = {
    id: newId(),
    title: title.trim(),
    type,
    category: CATEGORY_BY_TYPE[type] ?? 'Draft',
    folderId,
    checks, // analyses chosen on the setup screen
    tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    format: 'DOCX',
    source,
    content: '', // HTML from the Tiptap editor
    wordCount: 0,
    status: 'draft',
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
  };
  await db.documents.add(doc);
  requestPersistentStorage(); // ask the browser to keep our data; no need to wait
  queueUpsert(doc.id); // the account should know this document exists
  return doc;
}

export function getDocument(id) {
  return db.documents.get(id);
}

/** Newest first. */
export function listDocuments() {
  return db.documents.orderBy('updatedAt').reverse().toArray();
}

export async function updateDocument(id, changes) {
  const result = await db.documents.update(id, { ...changes, updatedAt: Date.now() });
  // Autosave calls this every few seconds. queueUpsert only leaves one row per
  // document, and the queue is drained on a debounce, so a long writing
  // session is still one small request every couple of seconds at most.
  queueUpsert(id);
  return result;
}

/**
 * Changes what kind of document this is — Thesis, Report, Legal…
 *
 * This is the one thing that decides which template the structure checks
 * measure the document against, and until now it could only be chosen on the
 * screen that created the document. An imported file never passed through
 * that screen, so every imported thesis arrived as "Other" — the one type
 * with no template — and its structure checks sat there doing nothing, with
 * no way to say so and no way to fix it.
 *
 * The category moves with it, so My documents keeps filing the document under
 * the right chip.
 */
export function setDocumentType(id, type) {
  return updateDocument(id, { type, category: CATEGORY_BY_TYPE[type] ?? 'Draft' });
}

/**
 * Makes a copy of a document, content and all.
 *
 * The copy is a new document in every way that matters: its own id, its own
 * version history, its own row in the account's list. Only the words are
 * shared, and only as they stand right now — editing the copy never touches
 * the original. The plan's document limit applies, because a copy takes a
 * slot like anything else.
 */
export async function duplicateDocument(id) {
  const original = await db.documents.get(id);
  if (!original) throw new Error('That document is no longer here.');

  const title = await nextCopyTitle(original.title);
  const copy = await createDocument({
    title,
    type: original.type,
    folderId: original.folderId,
    checks: original.checks ?? [],
    source: original.source ?? 'created',
  });
  await updateDocument(copy.id, {
    content: original.content ?? '',
    wordCount: original.wordCount ?? 0,
    format: original.format ?? 'DOCX',
    tint: original.tint,
  });
  return { ...copy, title };
}

/**
 * "Chapter one" → "Chapter one (copy)" → "Chapter one (copy 2)".
 *
 * It looks at the titles already in use, so copying the same document twice
 * gives two documents you can tell apart. Copying a copy starts from the
 * original's name rather than stacking "(copy) (copy)".
 */
async function nextCopyTitle(title) {
  const base = (title ?? 'Untitled').replace(/\s*\(copy(?: \d+)?\)$/i, '').trim() || 'Untitled';
  const taken = new Set((await db.documents.toArray()).map((doc) => doc.title));
  if (!taken.has(`${base} (copy)`)) return `${base} (copy)`;
  let number = 2;
  while (taken.has(`${base} (copy ${number})`)) number += 1;
  return `${base} (copy ${number})`;
}

/** Removes the document and all of its saved versions together. */
export async function deleteDocument(id) {
  await db.transaction('rw', db.documents, db.versions, async () => {
    await db.versions.where('docId').equals(id).delete();
    await db.documents.delete(id);
  });
  queueDelete(id); // other devices need to hear that it went
}
