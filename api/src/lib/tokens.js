/**
 * tokens.js — who is signed in, and for how long.
 *
 * Two tokens, because they have different jobs:
 *
 *   access token   a short-lived JWT (15 minutes). Sent with every request.
 *                  Nothing is looked up in the database to check it.
 *   refresh token  a long random string (30 days), kept in the sessions table
 *                  as a SHA-256 hash. Trades itself for a new access token,
 *                  and can be revoked — that is what "sign out" really does.
 *
 * A stolen access token dies on its own in minutes; a stolen refresh token can
 * be cancelled. A single long-lived token would give you neither.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

export const ACCESS_TOKEN_LIFETIME = '15m';
export const REFRESH_DAYS = 30;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Makes a refresh token, stores only its hash, and returns the token itself. */
export async function issueRefreshToken(userId, userAgent) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), userAgent: userAgent?.slice(0, 200) ?? null, expiresAt },
  });
  return { token, expiresAt };
}

/** The live session for this refresh token, or null. */
export async function findSession(token) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  return session;
}

/** Signing out: the session is revoked, so its refresh token stops working. */
export async function revokeSession(token) {
  const session = await findSession(token);
  if (!session) return false;
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return true;
}

/** What the browser is allowed to know about the signed-in user. */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier,
    createdAt: user.createdAt,
    // Not the password, and not its hash: only whether one exists. The
    // "choose a password" screen needs to know whether to ask for the old one.
    hasPassword: Boolean(user.passwordHash && user.passwordSalt),
  };
}
