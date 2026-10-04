/**
 * vaultSession.js — the unlocked vault key, held in memory only.
 *
 * It is never written to IndexedDB, localStorage or the server. Closing the
 * tab, or signing out, forgets it, and the next device or session has to unlock
 * again with the passphrase or the recovery code.
 */
let vaultKey = null;

export const setVaultKey = (key) => { vaultKey = key; };
export const getVaultKey = () => vaultKey;
export const clearVaultKey = () => { vaultKey = null; };
