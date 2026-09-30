/**
 * shareKeys.js — the real RSA-OAEP keypair behind Share's "public key" for
 * each document. Pages never touch db.shareKeys directly, the same rule as
 * documents.js.
 *
 * One keypair per document id. `crypto.subtle`-generated keys are
 * structured-clonable, so they are stored in IndexedDB as-is; the base64
 * (SPKI) form is cached alongside because that is what gets displayed,
 * copied, and put in a QR code — exporting it from the CryptoKey every time
 * would be needless async work on every render.
 */
import { db } from './db';
import { toBase64, fromBase64 } from './base64';

const RSA_OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' };

async function generateKeyPair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { ...RSA_OAEP, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true, // extractable — needed to export the public key for sharing
    ['encrypt', 'decrypt'],
  );
  const publicKeyBase64 = toBase64(await crypto.subtle.exportKey('spki', publicKey));
  return { publicKey, privateKey, publicKeyBase64 };
}

/** The document's keypair, generating one the first time it is asked for. */
export async function getOrCreateKeyPair(docId) {
  const existing = await db.shareKeys.get(docId);
  if (existing) return existing;
  const created = { docId, ...(await generateKeyPair()) };
  await db.shareKeys.put(created);
  return created;
}

/**
 * A fresh keypair, replacing the old one. Anything encrypted under the old
 * public key becomes permanently undecryptable — the same "regenerate"
 * meaning the button already claimed before this was real.
 */
export async function rotateKeyPair(docId) {
  const created = { docId, ...(await generateKeyPair()) };
  await db.shareKeys.put(created);
  return created;
}

/** Turns a pasted recipient public key (base64 SPKI) back into a usable key. */
export function importPublicKeyBase64(base64) {
  return crypto.subtle.importKey('spki', fromBase64(base64), RSA_OAEP, true, ['encrypt']);
}
