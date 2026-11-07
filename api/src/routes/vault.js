/**
 * vault.js — encrypted sync storage. The server keeps ciphertext and wrapped
 * keys only; it cannot read a document or unwrap the vault key.
 *
 *   PUT    /vault                    store the wrapped vault keys (once per account)
 *   GET    /vault                    fetch them on a new device
 *   PUT    /documents/:id/blob       upload one document's ciphertext
 *   GET    /documents/:id/blob       download it
 *   DELETE /documents/:id/blob       remove it
 *
 * Blob uploads carry an optimistic-concurrency version: the client sends the
 * version it last saw in `x-expected-version`, and a mismatch is refused with
 * 409 so one device never silently overwrites another device's newer edit.
 *
 * Bytes live in api/storage/blobs/<userId>/<docId>.bin (dev). The
 * DocumentBlob row records version, IV and size; nothing else.
 */
import { z } from 'zod';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/guards.js';

const BLOB_ROOT = fileURLToPath(new URL('../../storage/blobs', import.meta.url));
const MAX_BLOB_BYTES = 20 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const IV_PATTERN = /^[A-Za-z0-9+/]{16}$/; // 12 bytes, base64

const vaultBody = z.object({
  passSalt: z.string().min(1).max(200),
  passIv: z.string().min(1).max(200),
  wrappedByPass: z.string().min(1).max(2000),
  recSalt: z.string().min(1).max(200),
  recIv: z.string().min(1).max(200),
  wrappedByRecovery: z.string().min(1).max(2000),
});

function blobPath(userId, docId) {
  return path.join(BLOB_ROOT, userId, `${docId}.bin`);
}

function refuse(reply, code, message) {
  return reply.code(code).send({ error: code === 404 ? 'not_found' : 'invalid', message });
}

export default async function vaultRoutes(app) {
  // Raw ciphertext arrives as bytes, not JSON. Scoped to this plugin only.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_BLOB_BYTES }, (request, body, done) => {
    done(null, body);
  });

  app.addHook('preHandler', requireUser);

  app.put('/vault', async (request, reply) => {
    const parsed = vaultBody.safeParse(request.body);
    if (!parsed.success) return refuse(reply, 400, 'The vault keys are not in the expected shape.');
    await prisma.userVault.upsert({
      where: { userId: request.account.id },
      create: { userId: request.account.id, ...parsed.data },
      update: parsed.data,
    });
    return reply.send({ ok: true });
  });

  app.get('/vault', async (request, reply) => {
    const vault = await prisma.userVault.findUnique({ where: { userId: request.account.id } });
    if (!vault) return reply.code(404).send({ error: 'no_vault', message: 'Encrypted sync is not set up on this account yet.' });
    const record = {
      passSalt: vault.passSalt,
      passIv: vault.passIv,
      wrappedByPass: vault.wrappedByPass,
      recSalt: vault.recSalt,
      recIv: vault.recIv,
      wrappedByRecovery: vault.wrappedByRecovery,
    };
    return reply.send({ vault: record });
  });

  app.put('/documents/:id/blob', async (request, reply) => {
    const { id } = request.params;
    if (!SAFE_ID.test(id)) return refuse(reply, 400, 'That document id is not valid.');

    const iv = request.headers['x-iv'];
    if (typeof iv !== 'string' || !IV_PATTERN.test(iv)) return refuse(reply, 400, 'The encryption IV is missing or malformed.');

    const expected = Number(request.headers['x-expected-version'] ?? 0);
    if (!Number.isInteger(expected) || expected < 0) return refuse(reply, 400, 'The expected version is not valid.');

    const owned = await prisma.documentMeta.findUnique({ where: { id } });
    if (!owned || owned.userId !== request.account.id) return refuse(reply, 404, 'No such document on this account.');

    const existing = await prisma.documentBlob.findUnique({ where: { docId: id } });
    const current = existing?.version ?? 0;
    if (expected !== current) {
      return reply.code(409).send({ error: 'version_conflict', currentVersion: current, message: 'This document changed on another device.' });
    }

    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) return refuse(reply, 400, 'The document body is empty.');

    const target = blobPath(request.account.id, id);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, target); // whole file or nothing, never a half-written blob

    const version = current + 1;
    await prisma.documentBlob.upsert({
      where: { docId: id },
      create: { docId: id, userId: request.account.id, version, iv, sizeBytes: bytes.length },
      update: { version, iv, sizeBytes: bytes.length },
    });
    return reply.send({ version });
  });

  app.get('/documents/:id/blob', async (request, reply) => {
    const { id } = request.params;
    if (!SAFE_ID.test(id)) return refuse(reply, 400, 'That document id is not valid.');

    const blob = await prisma.documentBlob.findUnique({ where: { docId: id } });
    if (!blob || blob.userId !== request.account.id) return refuse(reply, 404, 'No encrypted copy of that document exists.');

    const bytes = await readFile(blobPath(blob.userId, id));
    return reply.send({ version: blob.version, iv: blob.iv, ciphertext: bytes.toString('base64') });
  });

  app.delete('/documents/:id/blob', async (request, reply) => {
    const { id } = request.params;
    if (!SAFE_ID.test(id)) return refuse(reply, 400, 'That document id is not valid.');

    const blob = await prisma.documentBlob.findUnique({ where: { docId: id } });
    if (blob && blob.userId === request.account.id) {
      await prisma.documentBlob.delete({ where: { docId: id } });
      await rm(blobPath(blob.userId, id), { force: true });
    }
    return reply.send({ ok: true });
  });
}
