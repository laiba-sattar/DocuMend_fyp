/**
 * blobs.js — the encrypted copy of each document's TEXT, sent to the server
 * and downloaded on another device. Metadata sync (sync/metadata.js) is
 * separate and still sends no text.
 *
 * The server only receives ciphertext sealed with the vault key
 * (storage/vault.js). This file never sends plaintext, and it does nothing at
 * all while the vault is locked.
 *
 * Writes go through a queue, like metadata: one row per document, drained a
 * few seconds after the last change. Each upload says which server version it
 * is based on, so two devices editing the same document cannot silently
 * overwrite each other — the loser keeps its text as a version snapshot.
 */
import { db, newId } from '../storage/db';
import { api } from '../api/client';
import { encryptContent, decryptContent } from '../storage/vault';
import { getVaultKey } from '../storage/vaultSession';
import { countWords } from '../storage/format';

const DEBOUNCE_MS = 4000;
let timer = null;
let draining = false;

const bytesOf = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const htmlToText = (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

async function fingerprint(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function scheduleDrain() {
  if (timer) return;
  timer = window.setTimeout(() => {
    timer = null;
    drainBlobs();
  }, DEBOUNCE_MS);
}

/** Remember that this document's text changed. Does nothing while the vault is locked. */
export function queueBlobUpload(id) {
  if (!id || !getVaultKey()) return;
  db.blobQueue.put({ id, queuedAt: Date.now() }).catch(() => {});
  scheduleDrain();
}

/** Removes the encrypted copy from the server. Best effort — the document is already gone here. */
export function queueBlobDelete(id) {
  if (!id) return;
  db.blobQueue.delete(id).catch(() => {});
  db.blobMeta.delete(id).catch(() => {});
  api.deleteBlob(id).catch(() => {});
}

/**
 * Keeps the text this device had as a version snapshot, then takes the
 * server's text. Nothing is lost silently.
 */
async function resolveConflict(id, key) {
  const local = await db.documents.get(id);
  const remote = await api.getBlob(id);
  const remoteHtml = await decryptContent(key, remote);

  if (local?.content) {
    await db.versions.add({
      id: newId(),
      docId: id,
      kind: 'auto',
      label: 'Before another device’s change',
      content: local.content,
      wordCount: local.wordCount ?? 0,
      createdAt: Date.now(),
    });
  }
  await db.documents.update(id, { content: remoteHtml, wordCount: countWords(htmlToText(remoteHtml)) });
  await db.blobMeta.put({ docId: id, version: remote.version, hash: await fingerprint(remoteHtml) });
}

/** Uploads everything waiting. Oldest first, and stops at the first sign the network or session is gone. */
export async function drainBlobs() {
  const key = getVaultKey();
  if (!key || draining) return;
  draining = true;
  try {
    const waiting = await db.blobQueue.orderBy('queuedAt').toArray();
    for (const entry of waiting) {
      const doc = await db.documents.get(entry.id);
      if (!doc) {
        await db.blobQueue.delete(entry.id);
        continue;
      }
      try {
        const text = doc.content ?? '';
        const sealed = await encryptContent(key, text);
        const meta = await db.blobMeta.get(entry.id);
        const saved = await api.putBlob(entry.id, bytesOf(sealed.ciphertext), {
          iv: sealed.iv,
          expectedVersion: meta?.version ?? 0,
        });
        await db.blobMeta.put({ docId: entry.id, version: saved.version, hash: await fingerprint(text) });
        await db.blobQueue.delete(entry.id);
      } catch (error) {
        if (error?.status === 409) {
          await resolveConflict(entry.id, key);
          await db.blobQueue.delete(entry.id);
          continue;
        }
        // Offline or signed out: keep the rest for next time.
        if (!error?.status || error.status === 401) break;
        await db.blobQueue.delete(entry.id);
        console.warn('[sync] the server refused an encrypted copy:', error.message);
      }
    }
  } finally {
    draining = false;
  }
}

/** Downloads one document's text from the server, decrypts it and stores it here. */
export async function pullBlob(id) {
  const key = getVaultKey();
  if (!key) throw new Error('Unlock your vault first.');
  const remote = await api.getBlob(id);
  const html = await decryptContent(key, remote);
  await db.documents.update(id, { content: html, wordCount: countWords(htmlToText(html)) });
  await db.blobMeta.put({ docId: id, version: remote.version, hash: await fingerprint(html) });
  return html;
}

/**
 * On a device that has never seen a document's text, creates the local record
 * from the account's metadata and fills in the text. Only documents the
 * account lists in `remoteDocs` are considered.
 */
export async function pullMissingBlobs() {
  if (!getVaultKey()) return;
  const remote = await db.remoteDocs.toArray();
  for (const row of remote) {
    const local = await db.documents.get(row.id);
    if (local?.content) continue;
    try {
      if (!local) {
        const when = new Date(row.deviceUpdatedAt).getTime();
        await db.documents.put({
          id: row.id,
          title: row.title,
          type: row.type ?? 'Other',
          category: row.category ?? 'Draft',
          folderId: row.folderId ?? 'root',
          checks: [],
          tint: 'sage',
          format: 'DOCX',
          source: 'created',
          content: '',
          wordCount: row.wordCount ?? 0,
          status: 'draft',
          syncStatus: 'synced',
          createdAt: when,
          updatedAt: when,
        });
      }
      await pullBlob(row.id);
    } catch (error) {
      if (!error?.status || error.status === 401) break;
    }
  }
}

/**
 * Called once the vault is unlocked. Queues any local text the server does
 * not have the latest copy of, uploads it, then fetches what other devices
 * have added.
 */
export async function startBlobSync() {
  if (!getVaultKey()) return;
  const docs = await db.documents.toArray();
  for (const doc of docs) {
    if (!doc.content) continue;
    const meta = await db.blobMeta.get(doc.id);
    if (!meta || meta.hash !== (await fingerprint(doc.content))) {
      await db.blobQueue.put({ id: doc.id, queuedAt: Date.now() });
    }
  }
  await drainBlobs();
  await pullMissingBlobs();
}
