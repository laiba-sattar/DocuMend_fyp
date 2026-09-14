/**
 * metadata.js — the document LIST follows the account; the document TEXT
 * never leaves this computer.
 *
 * That sentence is the whole design. When Laiba signs in on the university
 * computer she should see the twelve chapters she has at home — their names,
 * when she last touched them, how long they are — and she should be able to
 * see at a glance that their words are still at home. So this file sends the
 * server a title, a type, a word count and a date, and nothing else. The
 * server refuses anything more (api/src/routes/documents.js), which is the
 * promise written down twice: once here, once where it cannot be argued with.
 *
 * How it works
 * ------------
 * Writes are not sent as they happen. Every change drops one row into the
 * `syncQueue` store, keyed by the document's id, and a short debounce later
 * the queue is drained. Autosave fires every five seconds; without the queue
 * a long writing session would be a long stream of requests, and a session on
 * a train would be a long stream of failures.
 *
 * Nothing here ever throws into the app. If the server is down, or the
 * account has been signed out, the row simply stays in the queue and the
 * editor carries on — which is the point of a local-first program.
 */
import { db } from '../storage/db';
import { api } from '../api/client';
import { pagesFor } from '../storage/format';

const DEBOUNCE_MS = 2500;

let signedIn = false;
let draining = false;
let timer = null;

/* ---------------------------------------------------------------------------
   What the server is allowed to know
   ------------------------------------------------------------------------- */

/**
 * The only shape that ever goes up. Note what is missing: `content`.
 * It is built here, from the document, rather than passed in by a caller —
 * so no page can widen it by accident.
 */
function metadataOf(doc) {
  const words = doc.wordCount ?? 0;
  return {
    title: doc.title || 'Untitled',
    type: doc.type ?? 'Other',
    category: doc.category ?? 'Draft',
    folderId: doc.folderId ?? 'root',
    wordCount: words,
    pages: Math.max(1, pagesFor(words)),
    // How much room the text takes, not the text. Useful on the Storage page.
    sizeBytes: (doc.content?.length ?? 0) * 2, // JS strings are UTF-16
    deviceUpdatedAt: new Date(doc.updatedAt ?? Date.now()).toISOString(),
  };
}

/* ---------------------------------------------------------------------------
   The queue
   ------------------------------------------------------------------------- */

/** Remember that this document changed. Safe to call on every keystroke-ish save. */
export function queueUpsert(id) {
  if (!id) return;
  db.syncQueue.put({ id, op: 'upsert', queuedAt: Date.now() }).catch(() => {});
  schedule();
}

/** Remember that this document is gone. */
export function queueDelete(id) {
  if (!id) return;
  db.syncQueue.put({ id, op: 'delete', queuedAt: Date.now() }).catch(() => {});
  schedule();
}

function schedule() {
  if (!signedIn || timer) return;
  timer = window.setTimeout(() => {
    timer = null;
    drain();
  }, DEBOUNCE_MS);
}

/**
 * Sends everything waiting. One document at a time, oldest first, and it stops
 * at the first sign that the network or the session is not there — no point
 * hammering a server that is not listening.
 */
export async function drain() {
  if (!signedIn || draining) return;
  draining = true;
  try {
    const waiting = await db.syncQueue.orderBy('queuedAt').toArray();
    for (const entry of waiting) {
      try {
        if (entry.op === 'delete') {
          await api.deleteDocumentMeta(entry.id);
        } else {
          const doc = await db.documents.get(entry.id);
          // Deleted between queueing and now: there is nothing to describe.
          if (!doc) { await db.syncQueue.delete(entry.id); continue; }
          await api.saveDocumentMeta(entry.id, metadataOf(doc));
        }
        await db.syncQueue.delete(entry.id);
      } catch (error) {
        // 404 on a delete means the server never had it — that counts as done.
        if (entry.op === 'delete' && error?.status === 404) {
          await db.syncQueue.delete(entry.id);
          continue;
        }
        // Signed out or offline: leave the rest for next time.
        if (!error?.status || error.status === 401) break;
        // A rejected body would never succeed on a retry; dropping it keeps
        // one bad row from blocking every other document forever.
        if (error.status === 400 || error.status === 403) {
          await db.syncQueue.delete(entry.id);
          console.warn('[sync] the server refused this document:', error.message);
          continue;
        }
        break;
      }
    }
  } finally {
    draining = false;
  }
}

/* ---------------------------------------------------------------------------
   Coming the other way
   ------------------------------------------------------------------------- */

/**
 * Fetches the account's list and keeps a copy, so the library can show
 * documents that live on another computer. Only metadata comes back — there
 * is no route that could return text.
 */
export async function pullRemote() {
  if (!signedIn) return;
  try {
    const { documents = [] } = await api.listDocumentMeta();
    await db.transaction('rw', db.remoteDocs, async () => {
      await db.remoteDocs.clear();
      if (documents.length) await db.remoteDocs.bulkPut(documents);
    });
  } catch {
    // The stored copy is still the best answer we have.
  }
}

/** Everything the account knows about, as last heard from the server. */
export function listRemote() {
  return db.remoteDocs.orderBy('deviceUpdatedAt').reverse().toArray();
}

/* ---------------------------------------------------------------------------
   Turning it on and off
   ------------------------------------------------------------------------- */

/**
 * Called when someone signs in. Anything written while signed out is queued
 * already, so the first thing that happens is that it goes up; then we ask
 * what else the account has.
 */
export async function startSync() {
  if (signedIn) return;
  signedIn = true;
  window.addEventListener('online', drain);
  await drain();       // anything written while signed out
  await pullRemote();  // what the account already knows about
  await reconcile();   // what it does not know about yet
  await drain();
}

/** Called on sign-out. The queue is kept — this device may sign in again. */
export async function stopSync() {
  signedIn = false;
  window.removeEventListener('online', drain);
  if (timer) { window.clearTimeout(timer); timer = null; }
  // The other account's list must not sit in this browser.
  await db.remoteDocs.clear().catch(() => {});
}

/**
 * Queues the local documents the server has not heard about, or has an older
 * date for. Signing in on a computer that already has work on it should
 * publish that work, not re-send all of it every single time.
 */
export async function reconcile() {
  const [local, remote] = await Promise.all([
    db.documents.toArray(),
    db.remoteDocs.toArray(),
  ]);
  const seen = new Map(remote.map((row) => [row.id, new Date(row.deviceUpdatedAt).getTime()]));

  const stale = local.filter((doc) => {
    const theirs = seen.get(doc.id);
    return theirs === undefined || (doc.updatedAt ?? 0) > theirs;
  });
  if (!stale.length) return;

  const now = Date.now();
  await db.syncQueue.bulkPut(stale.map((doc) => ({ id: doc.id, op: 'upsert', queuedAt: now })));
}
