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

/** The Create document screen asks for a type; My documents filters by category. */
const CATEGORY_BY_TYPE = {
  Thesis: 'Academic',
  'Research paper': 'Researcher',
  Legal: 'Legal',
  Report: 'Corporate',
  Other: 'Draft',
};

const TINTS = ['saffron', 'sage', 'coral', 'lavender', 'sky', 'gold'];

export async function createDocument({ title, type = 'Other', folderId = 'root', checks = [] }) {
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

/** Removes the document and all of its saved versions together. */
export async function deleteDocument(id) {
  await db.transaction('rw', db.documents, db.versions, async () => {
    await db.versions.where('docId').equals(id).delete();
    await db.documents.delete(id);
  });
  queueDelete(id); // other devices need to hear that it went
}
