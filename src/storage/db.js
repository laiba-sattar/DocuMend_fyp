/**
 * db.js — the one IndexedDB database DocuMend keeps in the browser.
 *
 * Dexie wraps IndexedDB. The strings below list each store's primary key
 * first, then the fields we search or sort by. Other fields can still be
 * saved on a record; they just can't be queried quickly.
 *
 * To add a store or an index later, never edit version(1) — add
 * db.version(2).stores({...}) underneath with the full new list.
 * Planned for later versions: analysis, citations, embeddings,
 * auditLog, syncQueue (see docs/data-model.md).
 */
import Dexie from 'dexie';

export const db = new Dexie('documend');

db.version(1).stores({
  documents: 'id, folderId, category, updatedAt',
  folders: 'id, parentId, name',
  versions: 'id, docId, createdAt',
  settings: 'key',
});

/**
 * Version 2 (section S5) — two stores for the account.
 *
 *   syncQueue   changes waiting to be told to the server. The primary key is
 *               the document's own id, so a document that is edited ten times
 *               while offline still leaves exactly one entry to send.
 *   remoteDocs  the list the server has, as last seen. This is what lets the
 *               library show a document that lives on another computer.
 *
 * Neither store ever holds document text. Version 1's stores are repeated
 * unchanged, which is how Dexie upgrades: the newest version lists everything.
 */
db.version(2).stores({
  documents: 'id, folderId, category, updatedAt',
  folders: 'id, parentId, name',
  versions: 'id, docId, createdAt',
  settings: 'key',
  syncQueue: 'id, queuedAt',
  remoteDocs: 'id, deviceUpdatedAt',
});

/**
 * Version 3 — one store for Share's per-document keypairs (real RSA-OAEP
 * keys now, see storage/shareKeys.js; this used to be simulated).
 *
 * Keyed by the document's own id, one keypair per document. `CryptoKey`
 * objects are structured-clonable, so they are stored as-is; the base64
 * form alongside is what the page displays, copies and puts in a QR code.
 */
db.version(3).stores({
  documents: 'id, folderId, category, updatedAt',
  folders: 'id, parentId, name',
  versions: 'id, docId, createdAt',
  settings: 'key',
  syncQueue: 'id, queuedAt',
  remoteDocs: 'id, deviceUpdatedAt',
  shareKeys: 'docId',
});

/**
 * Version 4 — encrypted sync bookkeeping. `blobQueue` holds documents whose
 * encrypted copy needs uploading; `blobMeta` remembers the server's version of
 * each document's encrypted copy, so an upload can say what it is based on.
 */
db.version(4).stores({
  documents: 'id, folderId, category, updatedAt',
  folders: 'id, parentId, name',
  versions: 'id, docId, createdAt',
  settings: 'key',
  syncQueue: 'id, queuedAt',
  remoteDocs: 'id, deviceUpdatedAt',
  shareKeys: 'docId',
  blobQueue: 'id, queuedAt',
  blobMeta: 'docId',
});

/** An id that also works on http:// LAN addresses, where crypto.randomUUID is missing. */
export function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
