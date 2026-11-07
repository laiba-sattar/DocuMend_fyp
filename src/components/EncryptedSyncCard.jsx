import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, Cloud, Copy, Lock, Unlock } from 'lucide-react';
import { lockSync, setUpSync, unlockSync, vaultStatus } from '../sync/vaultSetup';
import { getVaultKey, subscribeVaultKey } from '../storage/vaultSession';

/**
 * Settings → Account: turns encrypted sync on, unlocks it on this device, and
 * locks it again. The recovery code is shown exactly once, at setup.
 */
export default function EncryptedSyncCard() {
  const [status, setStatus] = useState('checking');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [savedCode, setSavedCode] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Reactive, not just a one-time check: a refresh can restore the vault key
  // a moment after this card has already mounted (storage/vaultSession.js),
  // and the card should flip to "active" the instant that happens, not stay
  // stuck on "locked" until the reader does something to re-trigger a check.
  const vaultKey = useSyncExternalStore(subscribeVaultKey, getVaultKey);
  useEffect(() => {
    let alive = true;
    vaultStatus()
      .then((value) => { if (alive) setStatus(value); })
      .catch(() => { if (alive) setStatus('unavailable'); });
    return () => { alive = false; };
  }, [vaultKey]);

  const run = async (action) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error?.message ?? 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetUp = (event) => {
    event.preventDefault();
    if (passphrase !== confirm) return setMessage("Those two passwords don't match.");
    run(async () => {
      const code = await setUpSync(passphrase);
      setRecoveryCode(code);
      setPassphrase('');
      setConfirm('');
      setStatus('unlocked');
    });
  };

  const handleUnlock = (event) => {
    event.preventDefault();
    run(async () => {
      try {
        await unlockSync(secret, { recovery: useRecovery });
        setSecret('');
        setStatus('unlocked');
      } catch (error) {
        if (useRecovery && error?.message?.includes('right format')) throw error;
        throw new Error(useRecovery
          ? "That backup code didn't work."
          : "That password didn't work.");
      }
    });
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(recoveryCode);
    setMessage('Backup code copied.');
  };

  return (
    <div className="set-v2-card-glass set-v2-mb-24">
      <div className="set-v2-diag-head">
        <div className="set-v2-diag-title-wrap">
          <Cloud size={18} className="set-v2-accent-icon" />
          <div>
            <h4>Sync across devices</h4>
            <p>
              Open your documents on your other devices. Your text is locked with a password only
              you know before it ever leaves this one — nobody else, including us, can read it.
              That also means if you lose both your password and your backup code, it's gone for
              good.
            </p>
          </div>
        </div>
      </div>

      {status === 'checking' && <p className="set-v2-field-note">Checking…</p>}
      {status === 'unavailable' && <p className="set-v2-field-note">Could not reach the server. Try again later.</p>}

      {recoveryCode && (
        <div className="set-v2-form">
          <p className="set-v2-field-note">
            This is your backup code — it gets you back in if you ever forget your password. It's
            shown only this once, so save it somewhere safe now (a notes app or password manager
            works well).
          </p>
          <code className="set-v2-field-note" style={{ wordBreak: 'break-all', fontSize: 15 }}>{recoveryCode}</code>
          <div className="set-v2-mt-20">
            <button type="button" className="set-v2-secondary-btn" onClick={copyCode}>
              <Copy size={14} /> Copy code
            </button>
          </div>
          <label className="set-v2-mt-20" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={savedCode} onChange={(e) => setSavedCode(e.target.checked)} />
            I've saved this backup code
          </label>
          <div className="set-v2-mt-20">
            <button
              type="button"
              className="set-v2-primary-btn"
              disabled={!savedCode}
              onClick={() => { setRecoveryCode(''); setSavedCode(false); }}
            >
              <CheckCircle2 size={14} /> Done
            </button>
          </div>
        </div>
      )}

      {!recoveryCode && status === 'none' && (
        <form className="set-v2-form" onSubmit={handleSetUp}>
          <div className="set-v2-input-field">
            <label htmlFor="vault-pass">Create a sync password (12+ characters)</label>
            <div className="set-v2-input-shell">
              <input id="vault-pass" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </div>
          </div>
          <div className="set-v2-input-field set-v2-mt-20">
            <label htmlFor="vault-confirm">Confirm password</label>
            <div className="set-v2-input-shell">
              <input id="vault-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <div className="set-v2-mt-20">
            <button type="submit" className="set-v2-primary-btn" disabled={busy || !passphrase || !confirm}>
              <Lock size={14} /> {busy ? 'Turning on…' : 'Turn on sync'}
            </button>
          </div>
        </form>
      )}

      {!recoveryCode && status === 'locked' && (
        <form className="set-v2-form" onSubmit={handleUnlock}>
          <p className="set-v2-field-note">Sync is already set up for your account — unlock it on this device to use it here too.</p>
          <div className="set-v2-input-field set-v2-mt-20">
            <label htmlFor="vault-secret">{useRecovery ? 'Backup code' : 'Sync password'}</label>
            <div className="set-v2-input-shell">
              <input
                id="vault-secret"
                type={useRecovery ? 'text' : 'password'}
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
          </div>
          <div className="set-v2-mt-20" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="set-v2-primary-btn" disabled={busy || !secret}>
              <Unlock size={14} /> {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            <button type="button" className="set-v2-secondary-btn" onClick={() => { setUseRecovery((v) => !v); setSecret(''); setMessage(''); }}>
              {useRecovery ? 'Use password instead' : "Forgot your password? Use your backup code"}
            </button>
          </div>
        </form>
      )}

      {!recoveryCode && status === 'unlocked' && (
        <div className="set-v2-form">
          <p className="set-v2-field-note">Sync is on for this device.</p>
          <div className="set-v2-mt-20">
            <button
              type="button"
              className="set-v2-secondary-btn"
              onClick={() => { lockSync(); setStatus('locked'); }}
            >
              <Lock size={14} /> Lock this device
            </button>
          </div>
        </div>
      )}

      {message && <p className="set-v2-field-note set-v2-mt-20">{message}</p>}
    </div>
  );
}
