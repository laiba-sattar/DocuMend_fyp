/**
 * documents.js — the document list, without the documents.
 *
 *   GET    /documents        the signed-in user's metadata, newest first
 *   PUT    /documents/:id    add or update one document's metadata
 *   DELETE /documents/:id    mark it deleted
 *
 * The one rule this file enforces above all: **the text never comes here.**
 * A request carrying `content` is refused with 400, not quietly ignored — a
 * bug in the app should fail loudly rather than leak a thesis to the server.
 */
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/guards.js';

const metadataBody = z.object({
  title: z.string().min(1).max(300),
  type: z.string().max(40).default('Other'),
  category: z.string().max(40).default('Draft'),
  folderId: z.string().max(80).default('root'),
  wordCount: z.number().int().min(0).max(10_000_000).default(0),
  pages: z.number().int().min(1).max(100_000).default(1),
  sizeBytes: z.number().int().min(0).default(0),
  deviceUpdatedAt: z.coerce.date(),
});

/** Fields that would mean document text. None of them belong in a request. */
const FORBIDDEN = ['content', 'html', 'text', 'body', 'plainText'];

export default async function documentRoutes(app) {
  app.addHook('preHandler', requireUser); // every route below needs an account

  app.get('/documents', async (request) => {
    const documents = await prisma.documentMeta.findMany({
      where: { userId: request.account.id, deletedAt: null },
      orderBy: { deviceUpdatedAt: 'desc' },
      take: 500,
    });
    return { documents };
  });

  app.put('/documents/:id', async (request, reply) => {
    const leak = FORBIDDEN.find((field) => field in (request.body ?? {}));
    if (leak) {
      return reply.code(400).send({
        error: 'content_not_allowed',
        message: `DocuMend's server never stores document text, so "${leak}" was refused.`,
      });
    }

    const parsed = metadataBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check the fields.' });
    }

    const { id } = request.params;
    const owner = await prisma.documentMeta.findUnique({ where: { id } });
    if (owner && owner.userId !== request.account.id) {
      return reply.code(403).send({ error: 'forbidden', message: 'That document belongs to another account.' });
    }

    const document = await prisma.documentMeta.upsert({
      where: { id },
      create: { id, userId: request.account.id, ...parsed.data },
      update: { ...parsed.data, deletedAt: null, syncedAt: new Date() },
    });
    return reply.send({ document });
  });

  app.delete('/documents/:id', async (request, reply) => {
    const document = await prisma.documentMeta.findUnique({ where: { id: request.params.id } });
    if (!document || document.userId !== request.account.id) {
      return reply.code(404).send({ error: 'not_found', message: 'No such document on this account.' });
    }
    // Marked, not erased: other devices need to hear that it went.
    await prisma.documentMeta.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    return reply.send({ ok: true });
  });
}
