/**
 * quota.js — how much browser storage DocuMend is using (NFR-04-01-04).
 *
 * navigator.storage.estimate() reports usage and quota for the whole site.
 * The per-store sizes are measured by serialising the records, so they are
 * close estimates rather than exact disk bytes.
 */
import { db } from './db';

export const WARN_AT_PERCENT = 80;

/** Size of a set of records once serialised, in bytes. */
function sizeOf(records) {
  return records.reduce((sum, record) => sum + new Blob([JSON.stringify(record)]).size, 0);
}

export async function getStorageReport() {
  const [documents, versions] = await Promise.all([db.documents.toArray(), db.versions.toArray()]);
  const documentsBytes = sizeOf(documents);
  const versionsBytes = sizeOf(versions);

  let usage = documentsBytes + versionsBytes;
  let quota = 0;
  let persisted = false;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      usage = Math.max(usage, estimate.usage ?? 0);
      quota = estimate.quota ?? 0;
    }
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    // Some browsers (or private windows) don't expose the Storage API.
  }

  const percent = quota ? (usage / quota) * 100 : 0;
  return {
    usage,
    quota,
    percent,
    nearlyFull: percent >= WARN_AT_PERCENT,
    persisted,
    documentsBytes,
    versionsBytes,
    otherBytes: Math.max(0, usage - documentsBytes - versionsBytes),
    documentCount: documents.length,
    versionCount: versions.length,
    autoVersionCount: versions.filter((v) => v.kind === 'auto').length,
  };
}

/**
 * Asks the browser not to clear DocuMend's data when disk space runs low.
 * Chrome and Edge decide silently; Firefox may show a prompt. Safe to call often.
 */
export async function requestPersistentStorage() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Deletes every document, folder, version and setting on this device. */
export async function wipeAllData() {
  await db.delete();
  await db.open(); // recreates the empty database so the app keeps working
}

/** "512 B" · "14.2 KB" · "3.4 MB" · "1.2 GB" */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** "0.02%" for tiny numbers, "12%" otherwise. */
export function formatPercent(percent) {
  if (percent === 0) return '0%';
  if (percent < 1) return `${percent.toFixed(2)}%`;
  return `${Math.round(percent)}%`;
}
