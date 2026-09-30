/**
 * prisma.js — one database client for the whole server.
 *
 * `node --watch` restarts the file on every save; without this guard each
 * restart would open a new pool of connections and the database would run out.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__documendPrisma ?? new PrismaClient();

if (!globalForPrisma.__documendPrisma) globalForPrisma.__documendPrisma = prisma;
