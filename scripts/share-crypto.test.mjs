/**
 * share-crypto.test.mjs — round-trips Share's real encryption end to end.
 *
 * Node exposes the same Web Crypto API globally (crypto.subtle, atob/btoa,
 * TextEncoder/TextDecoder) as the browser, and shareCrypto.js / base64.js
 * touch nothing Dexie/IndexedDB-specific, so both import unmodified here.
 *
 *   node --test scripts/share-crypto.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptForRecipient, decryptPackage } from '../src/storage/shareCrypto.js';
import { toBase64, fromBase64 } from '../src/storage/base64.js';

const RSA_OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' };

/** Test fixture only — shareKeys.js does the same thing, but reads/writes Dexie too. */
async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { ...RSA_OAEP, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt'],
  );
}

test('a document round-trips through export and import unchanged', async () => {
  const recipient = await generateKeyPair();
  const original = '<p>The lab budget is PKR 45,000.</p>';
  const pkg = await encryptForRecipient(original, recipient.publicKey);
  const decrypted = await decryptPackage(pkg, recipient.privateKey);
  assert.equal(decrypted, original);
});

test('the exported public key is a genuine SPKI RSA key, not a fake string', async () => {
  const pair = await generateKeyPair();
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const base64 = toBase64(spki);
  // A real 2048-bit RSA SPKI key always starts with this DER header.
  assert.ok(base64.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A'));
});

test('a package cannot be decrypted with the wrong private key', async () => {
  const recipient = await generateKeyPair();
  const attacker = await generateKeyPair();
  const pkg = await encryptForRecipient('secret content', recipient.publicKey);
  await assert.rejects(() => decryptPackage(pkg, attacker.privateKey));
});

test('rotating a key (a fresh keypair) can no longer open an old package', async () => {
  const oldKeyPair = await generateKeyPair();
  const pkg = await encryptForRecipient('secret content', oldKeyPair.publicKey);
  const newKeyPair = await generateKeyPair(); // simulates rotateKeyPair()
  await assert.rejects(() => decryptPackage(pkg, newKeyPair.privateKey));
});

test('a public key exported and re-imported (as if pasted by a recipient) still works', async () => {
  const recipient = await generateKeyPair();
  const spkiBase64 = toBase64(await crypto.subtle.exportKey('spki', recipient.publicKey));
  const reimported = await crypto.subtle.importKey('spki', fromBase64(spkiBase64), RSA_OAEP, true, ['encrypt']);
  const pkg = await encryptForRecipient('pasted-key roundtrip', reimported);
  const decrypted = await decryptPackage(pkg, recipient.privateKey);
  assert.equal(decrypted, 'pasted-key roundtrip');
});
