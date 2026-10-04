/**
 * vault.js — the key that encrypts document content before it leaves the
 * device. The server only ever stores what this module produces.
 *
 * One random 256-bit vault key encrypts every document. That key is stored
 * twice, wrapped (AES-GCM): once under a key derived from the vault
 * passphrase (PBKDF2-SHA256), and once under a key derived from a recovery
 * code (HKDF-SHA256 — the code is already 256 random bits, so no slow
 * stretching is needed). Neither wrapped copy is useful without its secret.
 */
import { toBase64, fromBase64 } from './base64.js';

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RECOVERY_BYTES = 32;
const enc = new TextEncoder();

async function derivePassphraseKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function deriveRecoveryKey(recoveryBytes, salt) {
  const material = await crypto.subtle.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('documend-vault-recovery') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrap(wrappingKey, vaultKey) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', vaultKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv: toBase64(iv), wrapped: toBase64(wrapped) };
}

async function unwrap(wrappingKey, { iv, wrapped }) {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped),
    wrappingKey,
    { name: 'AES-GCM', iv: new Uint8Array(fromBase64(iv)) },
    { name: 'AES-GCM', length: 256 },
    true, // extractable only so the vault key can be re-wrapped if the passphrase changes
    ['encrypt', 'decrypt'],
  );
}

/** Hex, grouped into 8-character blocks so it can be read and copied. */
function formatRecoveryCode(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{1,8}/g).join('-');
}

function parseRecoveryCode(code) {
  const hex = code.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('That recovery code is not in the right format.');
  return new Uint8Array(hex.match(/../g).map((pair) => parseInt(pair, 16)));
}

/**
 * Creates a new vault. Returns the recovery code (show it once, the user must
 * keep it) and the record to store on the server. The record contains no
 * usable key.
 */
export async function createVault(passphrase) {
  const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const recoveryBytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
  const passSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const recSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const byPass = await wrap(await derivePassphraseKey(passphrase, passSalt), vaultKey);
  const byRecovery = await wrap(await deriveRecoveryKey(recoveryBytes, recSalt), vaultKey);

  return {
    recoveryCode: formatRecoveryCode(recoveryBytes),
    record: {
      v: 1,
      passSalt: toBase64(passSalt),
      passIv: byPass.iv,
      wrappedByPass: byPass.wrapped,
      recSalt: toBase64(recSalt),
      recIv: byRecovery.iv,
      wrappedByRecovery: byRecovery.wrapped,
    },
  };
}

/** The vault key, from the passphrase. Throws if the passphrase is wrong. */
export async function unlockWithPassphrase(record, passphrase) {
  const key = await derivePassphraseKey(passphrase, new Uint8Array(fromBase64(record.passSalt)));
  return unwrap(key, { iv: record.passIv, wrapped: record.wrappedByPass });
}

/** The vault key, from the recovery code. Throws if the code is wrong. */
export async function unlockWithRecoveryCode(record, code) {
  const key = await deriveRecoveryKey(parseRecoveryCode(code), new Uint8Array(fromBase64(record.recSalt)));
  return unwrap(key, { iv: record.recIv, wrapped: record.wrappedByRecovery });
}

/** Encrypts one document's content. Each call uses a fresh IV. */
export async function encryptContent(vaultKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, enc.encode(plaintext));
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** Decrypts content. Throws if the ciphertext was changed or the key is wrong. */
export async function decryptContent(vaultKey, { iv, ciphertext }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(fromBase64(iv)) },
    vaultKey,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plain);
}
