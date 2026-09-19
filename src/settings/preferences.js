/**
 * preferences.js — the choices made on the Settings page, kept where the
 * documents are kept.
 *
 * These live in the browser's own `settings` store (Dexie), not on the server,
 * for the same reason the documents do: they say something about what someone
 * is writing — which template they follow, which checks they care about — and
 * that is nobody else's business.
 *
 *   const [kind, setKind] = usePreference('defaultKind', 'Thesis');
 *
 * `usePreference` re-renders on its own when the value changes anywhere in the
 * app, because it reads through Dexie's live query.
 */
import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';

/** Every preference this app knows about, with what it falls back to. */
export const DEFAULTS = {
  /** The document type "Create document" starts on. */
  defaultKind: 'Thesis',
  /** Engine checks the reader has switched off, by id. */
  mutedChecks: [],
  /** Hide document titles in lists until pointed at. */
  privacyMode: false,
};

export async function getPreference(key) {
  const row = await db.settings.get(key);
  return row?.value ?? DEFAULTS[key];
}

export async function setPreference(key, value) {
  await db.settings.put({ key, value });
}

/** Reads a preference and gives back a setter, like useState but it persists. */
export function usePreference(key) {
  const value = useLiveQuery(() => getPreference(key), [key], DEFAULTS[key]);
  const set = useCallback((next) => setPreference(key, next), [key]);
  return [value ?? DEFAULTS[key], set];
}
