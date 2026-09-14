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

const passwordBody = z.object({
  // Only needed when the account already has one. An account that got in by
  // Google or by an emailed link has nothing to prove here — proving the
  // address *was* the proof.
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});

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
    if (!user.passwordHash || !user.passwordSalt) {
      // The account exists but has no password: it was made with Google or an
      // email link. Saying so is safe — they already proved the address once.
      return reply.code(409).send({
        error: 'no_password',
        message: 'This account signs in with Google or an email link. Use one of those buttons.',
      });
    }
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

  /**
   * POST /auth/password — set or change this account's password.
   *
   * This is the end of the "forgot password" journey. DocuMend does not email
   * a reset link of its own; it emails the same one-time sign-in link, which
   * puts the person back inside their account. Once they are in — proven by
   * the access token on this request — they may set a new password.
   *
   * That is deliberate. A reset link and a sign-in link prove exactly the same
   * thing (this person can read that inbox), so keeping two of them would mean
   * two sets of tokens to expire and two ways to get it wrong.
   */
  app.post('/auth/password', { preHandler: requireUser }, async (request, reply) => {
    const parsed = passwordBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: firstProblem(parsed.error) });

    const account = request.account;
    const hasPassword = Boolean(account.passwordHash && account.passwordSalt);

    if (hasPassword) {
      if (!parsed.data.currentPassword) {
        return reply.code(400).send({
          error: 'current_password_required',
          message: 'Type your current password to change it.',
        });
      }
      const ok = await verifyPassword(parsed.data.currentPassword, account.passwordHash, account.passwordSalt);
      if (!ok) {
        return reply.code(401).send({ error: 'bad_credentials', message: 'That current password is not right.' });
      }
    }

    const { hash, salt } = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: account.id },
      data: { passwordHash: hash, passwordSalt: salt },
    });

    // Every other device is signed out. If the password was changed because
    // somebody else may have had it, leaving their session alive would make
    // the change pointless.
    const keep = await findSession(request.body?.refreshToken ?? '');
    await prisma.session.deleteMany({
      where: { userId: account.id, ...(keep ? { NOT: { id: keep.id } } : {}) },
    });

    return reply.send({ ok: true, user: publicUser({ ...account, passwordHash: hash, passwordSalt: salt }) });
  });
}
