/**
 * auth.js — sign up, sign in, stay signed in, sign out.
 *
 *   POST /auth/signup    { email, name, password }      → user + tokens
 *   POST /auth/login     { email, password }            → user + tokens
 *   POST /auth/refresh   { refreshToken }               → a new access token
 *   POST /auth/logout    { refreshToken }               → that device is out
 *   GET  /auth/me                                       → the signed-in user
 *
 * Note what is *not* here: nothing in this file can read a document. Accounts
 * and documents are deliberately separate — see routes/documents.js.
 */
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { ACCESS_TOKEN_LIFETIME, findSession, issueRefreshToken, publicUser, revokeSession } from '../lib/tokens.js';
import { requireUser } from '../lib/guards.js';

const signupBody = z.object({
  email: z.string().email('That email address does not look right.'),
  name: z.string().min(2, 'Please give a name.').max(80),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({ refreshToken: z.string().min(10) });

/** Turns a zod error into one plain sentence for the user. */
const firstProblem = (error) => error.issues[0]?.message ?? 'Please check what you typed.';

export default async function authRoutes(app) {
  const accessTokenFor = (user) => app.jwt.sign({ sub: user.id, tier: user.tier }, { expiresIn: ACCESS_TOKEN_LIFETIME });

  app.post('/auth/signup', async (request, reply) => {
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: firstProblem(parsed.error) });

    const email = parsed.data.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: 'email_taken', message: 'An account with this email already exists.' });
    }

    const { hash, salt } = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: { email, name: parsed.data.name.trim(), passwordHash: hash, passwordSalt: salt },
    });
    const refresh = await issueRefreshToken(user.id, request.headers['user-agent']);

    return reply.code(201).send({
      user: publicUser(user),
      accessToken: accessTokenFor(user),
      refreshToken: refresh.token,
      expiresAt: refresh.expiresAt,
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: firstProblem(parsed.error) });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
    // The same answer either way, so nobody can use this to discover which
    // email addresses have accounts.
    const wrong = { error: 'bad_credentials', message: 'That email and password do not match.' };
    if (!user) return reply.code(401).send(wrong);
    if (!(await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt))) {
      return reply.code(401).send(wrong);
    }

    const refresh = await issueRefreshToken(user.id, request.headers['user-agent']);
    return reply.send({
      user: publicUser(user),
      accessToken: accessTokenFor(user),
      refreshToken: refresh.token,
      expiresAt: refresh.expiresAt,
    });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: 'No refresh token was sent.' });

    const session = await findSession(parsed.data.refreshToken);
    if (!session) {
      return reply.code(401).send({ error: 'session_expired', message: 'Please sign in again.' });
    }
    return reply.send({ user: publicUser(session.user), accessToken: accessTokenFor(session.user) });
  });

  app.post('/auth/logout', async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: 'No refresh token was sent.' });
    await revokeSession(parsed.data.refreshToken);
    return reply.send({ ok: true }); // already signed out is still success
  });

  app.get('/auth/me', { preHandler: requireUser }, async (request) => ({
    user: publicUser(request.account),
  }));
}
