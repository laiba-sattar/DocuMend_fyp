/**
 * passwords.js — hashing, with what Node already has.
 *
 * scrypt is built into Node, so there is no native package to compile and
 * nothing extra to install. It is deliberately slow and memory-hungry, which
 * is exactly what you want: guessing passwords becomes expensive.
 *
 * Every password gets its own random salt, so two people with the same
 * password still end up with different hashes.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const KEY_BYTES = 64;
const SALT_BYTES = 16;

export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = await derive(password, salt, KEY_BYTES);
  return { hash: hash.toString('hex'), salt };
}

/** Compares in constant time, so the answer's timing never leaks the hash. */
export async function verifyPassword(password, hash, salt) {
  const attempt = await derive(password, salt, KEY_BYTES);
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== attempt.length) return false;
  return timingSafeEqual(stored, attempt);
}
