/**
 * shareCrypto.js — hybrid encryption for Share's exported packages.
 *
 * RSA-OAEP-2048 can only encrypt about 190 bytes directly, so a document's
 * HTML goes through the standard two-step scheme the page's own label
 * already named ("RSA-OAEP + AES-256"): a random AES-256-GCM key encrypts
 * the actual content, and the recipient's RSA-OAEP public key encrypts
 * (wraps) that AES key. Only the holder of the matching RSA private key can
 * unwrap it and read the content.
 */
import { toBase64, fromBase64 } from './base64.js';

const AES_GCM = 'AES-GCM';
const IV_BYTES = 12; // the standard, recommended AES-GCM IV length

/** Encrypts `plaintext` so only `recipientPublicKey`'s matching private key can read it. */
export async function encryptForRecipient(plaintext, recipientPublicKey) {
  const aesKey = await crypto.subtle.generateKey({ name: AES_GCM, length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: AES_GCM, iv }, aesKey, encoded);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPublicKey, rawAesKey);

  return {
    v: 1,
    iv: toBase64(iv.buffer),
    wrappedKey: toBase64(wrappedKey),
    ciphertext: toBase64(ciphertext),
  };
}

/** Reverses encryptForRecipient using the matching RSA-OAEP private key. */
export async function decryptPackage(pkg, myPrivateKey) {
  const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, myPrivateKey, fromBase64(pkg.wrappedKey));
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: AES_GCM }, false, ['decrypt']);
  const iv = new Uint8Array(fromBase64(pkg.iv));
  const decrypted = await crypto.subtle.decrypt({ name: AES_GCM, iv }, aesKey, fromBase64(pkg.ciphertext));
  return new TextDecoder().decode(decrypted);
}
