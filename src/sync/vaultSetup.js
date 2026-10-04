/**
 * vaultSetup.js — the steps a person takes to turn encrypted sync on, unlock
 * it on a new device, and lock it again. The Settings card only calls these.
 */
import { api } from '../api/client';
import { createVault, unlockWithPassphrase, unlockWithRecoveryCode } from '../storage/vault';
import { setVaultKey, getVaultKey, clearVaultKey } from '../storage/vaultSession';
import { startBlobSync } from './blobs';

const MIN_PASSPHRASE = 12;

/**
 * 'none'     nothing set up on this account yet
 * 'locked'   set up on the account, but this device has not unlocked it
 * 'unlocked' this device can read and write encrypted copies
 */
export async function vaultStatus() {
  if (getVaultKey()) return 'unlocked';
  try {
    await api.getVault();
    return 'locked';
  } catch (error) {
    if (error?.status === 404) return 'none';
    throw error;
  }
}

/**
 * Creates the vault and returns the recovery code, which the caller must show
 * once. Refuses if the account already has a vault: replacing it would make
 * every encrypted copy on the other devices unreadable.
 */
export async function setUpSync(passphrase) {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  if ((await vaultStatus()) !== 'none') {
    throw new Error('Encrypted sync is already set up on this account.');
  }
  const { recoveryCode, record } = await createVault(passphrase);
  await api.saveVault(record);
  setVaultKey(await unlockWithPassphrase(record, passphrase));
  startBlobSync().catch(() => {});
  return recoveryCode;
}

/** Unlocks this device with the passphrase, or with the recovery code when `recovery` is true. */
export async function unlockSync(secret, { recovery = false } = {}) {
  const { vault } = await api.getVault();
  const key = recovery
    ? await unlockWithRecoveryCode(vault, secret)
    : await unlockWithPassphrase(vault, secret);
  setVaultKey(key);
  startBlobSync().catch(() => {});
}

export function lockSync() {
  clearVaultKey();
}
