/**
 * vaultSession.js — the unlocked vault key.
 *
 * Held in memory, and mirrored into sessionStorage so a refresh of this same
 * tab does not force the passphrase prompt again. sessionStorage is gone the
 * moment the tab closes, by the browser's own doing — nothing here is ever
 * written to localStorage, IndexedDB or the server. A mirrored copy that has
 * sat untouched past IDLE_LIMIT_MS is treated as stale and discarded at
 * restore time, so walking away and coming back much later still asks again.
 */
import { toBase64, fromBase64 } from './base64';

const STORAGE_KEY = 'documend.vaultSession';
const IDLE_LIMIT_MS = 30 * 60 * 1000;

let vaultKey = null;
const listeners = new Set();

const notify = () => listeners.forEach((callback) => callback());

function readEntry() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEntry(entry) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage blocked (private mode, quota, etc.) — the in-memory key still
    // works for the rest of this tab's life, it just won't survive a refresh.
  }
}

export const setVaultKey = (key) => {
  vaultKey = key;
  notify();
  if (!key) return;
  crypto.subtle.exportKey('raw', key)
    .then((raw) => writeEntry({ raw: toBase64(raw), expiresAt: Date.now() + IDLE_LIMIT_MS }))
    .catch(() => {});
};

/** Every read extends the idle timer — only a tab left untouched this long locks itself. */
export const getVaultKey = () => {
  if (vaultKey) {
    const entry = readEntry();
    if (entry) writeEntry({ ...entry, expiresAt: Date.now() + IDLE_LIMIT_MS });
  }
  return vaultKey;
};

export const clearVaultKey = () => {
  vaultKey = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* already gone */ }
  notify();
};

/**
 * Called once when the app starts. Brings back a key this same tab unlocked
 * earlier, unless it sat idle past the limit. Returns whether it worked, so
 * the caller knows whether to also fetch what changed while this tab was away.
 */
export async function restoreVaultKey() {
  const entry = readEntry();
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* already gone */ } }
    return false;
  }
  try {
    vaultKey = await crypto.subtle.importKey(
      'raw',
      fromBase64(entry.raw),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    writeEntry({ ...entry, expiresAt: Date.now() + IDLE_LIMIT_MS });
    notify();
    return true;
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* already gone */ }
    return false;
  }
}

/** Lets a component re-render when the vault locks, unlocks, or is restored — `useSyncExternalStore(subscribeVaultKey, getVaultKey)`. */
export function subscribeVaultKey(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
