/**
 * guards.js — the two checks every protected route needs.
 *
 *   requireUser  the request carries a valid access token
 *   requireTier  …and the account's plan is high enough
 *
 * Tiers are ordered, so PREMIUM passes a BASIC check but not the other way.
 */
import { prisma } from './prisma.js';

const ORDER = { BASIC: 0, PREMIUM: 1, ENTERPRISE: 2 };

/** Fastify hook: rejects with 401 unless the access token is valid. */
export async function requireUser(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: 'Sign in again.' });
  }
  const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
  if (!user) {
    return reply.code(401).send({ error: 'unauthorized', message: 'This account no longer exists.' });
  }
  request.account = user;
  return undefined;
}

/** Fastify hook factory: use after requireUser. */
export function requireTier(minimum) {
  return async (request, reply) => {
    const has = ORDER[request.account?.tier] ?? -1;
    if (has < (ORDER[minimum] ?? 0)) {
      return reply.code(403).send({
        error: 'upgrade_required',
        message: `This needs the ${minimum.toLowerCase()} plan.`,
        tier: request.account?.tier ?? null,
      });
    }
    return undefined;
  };
}
