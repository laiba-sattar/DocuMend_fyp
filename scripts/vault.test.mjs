/**
 * vault.test.mjs — the zero-knowledge vault: passphrase and recovery code
 * both unlock the same key, wrong secrets fail, and tampering is caught.
 *
 *   node --test scripts/vault.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVault,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  encryptContent,
  decryptContent,
} from '../src/storage/vault.js';

const PASS = 'correct horse battery staple';

test('content encrypted with the vault key decrypts back unchanged', async () => {
  const { record } = await createVault(PASS);
  const key = await unlockWithPassphrase(record, PASS);
  const enc = await encryptContent(key, '<p>Chapter 1: the lab budget is PKR 45,000.</p>');
  assert.equal(await decryptContent(key, enc), '<p>Chapter 1: the lab budget is PKR 45,000.</p>');
});

test('the stored record does not contain plaintext content or a raw key', async () => {
  const { record } = await createVault(PASS);
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes('correct horse'));
  assert.ok(!serialized.includes('recoveryCode'));
});

test('a wrong passphrase cannot unlock the vault', async () => {
  const { record } = await createVault(PASS);
  await assert.rejects(() => unlockWithPassphrase(record, 'wrong passphrase'));
});

test('the recovery code unlocks the same vault key as the passphrase', async () => {
  const { recoveryCode, record } = await createVault(PASS);
  const byPass = await unlockWithPassphrase(record, PASS);
  const byRecovery = await unlockWithRecoveryCode(record, recoveryCode);
  const enc = await encryptContent(byPass, 'written on device A');
  assert.equal(await decryptContent(byRecovery, enc), 'written on device A');
});

test('the recovery code tolerates spaces and lowercase when typed back in', async () => {
  const { recoveryCode, record } = await createVault(PASS);
  const typed = recoveryCode.toUpperCase().replace(/-/g, ' ');
  const key = await unlockWithRecoveryCode(record, typed);
  const enc = await encryptContent(key, 'ok');
  assert.equal(await decryptContent(key, enc), 'ok');
});

test('a wrong recovery code is rejected', async () => {
  const { record } = await createVault(PASS);
  const other = await createVault(PASS);
  await assert.rejects(() => unlockWithRecoveryCode(record, other.recoveryCode));
});

test('a malformed recovery code is rejected with a clear error', async () => {
  const { record } = await createVault(PASS);
  await assert.rejects(() => unlockWithRecoveryCode(record, 'not-a-code'), /right format/);
});

test('tampered ciphertext fails to decrypt', async () => {
  const { record } = await createVault(PASS);
  const key = await unlockWithPassphrase(record, PASS);
  const enc = await encryptContent(key, 'original text');
  const bytes = Buffer.from(enc.ciphertext, 'base64');
  bytes[0] ^= 0xff;
  await assert.rejects(() => decryptContent(key, { iv: enc.iv, ciphertext: bytes.toString('base64') }));
});

test('each encryption uses a fresh IV, so the same text never produces the same ciphertext', async () => {
  const { record } = await createVault(PASS);
  const key = await unlockWithPassphrase(record, PASS);
  const a = await encryptContent(key, 'same text');
  const b = await encryptContent(key, 'same text');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});
