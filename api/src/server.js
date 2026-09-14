/**
 * server.js — the DocuMend API.
 *
 * Start it with `npm run dev` inside /api. It listens on http://localhost:4000
 * and the React app (http://localhost:5173) is allowed to call it.
 *
 * Routes:
 *   GET  /health        is the server (and the database) alive?
 *   /auth/*             accounts — see routes/auth.js
 *   /documents/*        metadata only — see routes/documents.js
 */
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';

const PORT = Number(process.env.PORT ?? 4000);
const ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim());

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  console.error('\nJWT_SECRET is missing or too short. Copy api/.env.example to api/.env and fill it in.\n');
  process.exit(1);
}

const app = Fastify({
  logger: { transport: undefined, level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 256 * 1024, // metadata is tiny; a big body means something is wrong
});

await app.register(cors, { origin: ORIGINS, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET });

// A DELETE often arrives with `content-type: application/json` and no body.
// Fastify rejects that by default; an empty body simply means "no fields".
app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
  if (!body || body.trim() === '') return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch {
    const error = new Error('The request body is not valid JSON.');
    error.statusCode = 400;
    done(error, undefined);
  }
});

app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`; // the database, not just the server
  return { ok: true, service: 'documend-api', time: new Date().toISOString() };
});

await app.register(authRoutes);
await app.register(documentRoutes);

/** One shape for every error, so the app never has to guess. */
app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  reply.code(status).send({
    error: status === 500 ? 'server_error' : (error.code ?? 'error'),
    message: status === 500 ? 'Something went wrong on the server.' : error.message,
  });
});

app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'not_found', message: `No route for ${request.method} ${request.url}.` });
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`DocuMend API on http://localhost:${PORT} — allowed from ${ORIGINS.join(', ')}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Close the database cleanly on Ctrl+C, so connections are not left hanging.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
