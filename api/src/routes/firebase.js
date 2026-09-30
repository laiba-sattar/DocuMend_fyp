/**
 * firebase.js — "Continue with Google" and "sign in with an email link".
 *
 *   POST /auth/firebase  { idToken }  → user + our own tokens
 *
 * Firebase does one job only: proving who the person is, and sending the
 * sign-in email so we do not have to run a mail server. Everything after that
 * is ours — the account lives in our Postgres, and the session is the same
 * access + refresh pair every other sign-in gets. Nothing about the app
 * depends on Firebase beyond this one route.
 *
 * The token is checked against Google's public certificates (lib/firebaseToken.js),
 * so no service-account key is needed anywhere.
 */
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyFirebaseToken } from '../lib/firebaseToken.js';
import { ACCESS_TOKEN_LIFETIME, issueRefreshToken, publicUser } from '../lib/tokens.js';

const body = z.object({ idToken: z.string().min(20) });

/** "laiba.sattar@gmail.com" → "Laiba Sattar", when Firebase sends no name. */
function nameFromEmail(email) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ') || 'Writer';
}

export default async function firebaseRoutes(app) {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  app.post('/auth/firebase', async (request, reply) => {
    if (!projectId) {
      return reply.code(503).send({
        error: 'firebase_not_configured',
        message: 'Sign-in with Google or an email link is not set up on this server yet.',
      });
    }

    const parsed = body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', message: 'No sign-in token was sent.' });

    let identity;
    try {
      identity = await verifyFirebaseToken(parsed.data.idToken, projectId);
    } catch (error) {
      request.log.warn({ err: error.message }, 'Firebase token rejected');
      return reply.code(401).send({ error: 'bad_token', message: 'That sign-in could not be confirmed. Please try again.' });
    }

    if (!identity.email) {
      return reply.code(401).send({ error: 'no_email', message: 'That account has no email address.' });
    }

    // Known Firebase user, or the same email from an earlier password sign-up:
    // both are the same person, so the accounts are joined rather than doubled.
    let user = await prisma.user.findFirst({
      where: { OR: [{ firebaseUid: identity.uid }, { email: identity.email }] },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: identity.uid,
          emailVerified: user.emailVerified || identity.emailVerified,
          avatarUrl: identity.picture ?? user.avatarUrl,
          name: user.name || identity.name || nameFromEmail(identity.email),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: identity.email,
          name: identity.name || nameFromEmail(identity.email),
          firebaseUid: identity.uid,
          emailVerified: identity.emailVerified,
          avatarUrl: identity.picture ?? null,
        },
      });
    }

    const refresh = await issueRefreshToken(user.id, request.headers['user-agent']);
    return reply.send({
      user: publicUser(user),
      accessToken: app.jwt.sign({ sub: user.id, tier: user.tier }, { expiresIn: ACCESS_TOKEN_LIFETIME }),
      refreshToken: refresh.token,
      expiresAt: refresh.expiresAt,
      provider: identity.provider, // 'google.com' or 'password' (the email link)
    });
  });
}
