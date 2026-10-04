import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Copy, Lock, Unlock } from 'lucide-react';
import { lockSync, setUpSync, unlockSync, vaultStatus } from '../sync/vaultSetup';

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

  useEffect(() => {
    let alive = true;
    vaultStatus()
      .then((value) => { if (alive) setStatus(value); })
      .catch(() => { if (alive) setStatus('unavailable'); });
    return () => { alive = false; };
  }, []);

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
    if (passphrase !== confirm) return setMessage('The two passphrases do not match.');
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
          ? 'That recovery code did not unlock the vault.'
          : 'That passphrase did not unlock the vault.');
      }
    });
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(recoveryCode);
    setMessage('Recovery code copied.');
  };

  return (
    <div className="set-v2-card-glass set-v2-mb-24">
      <div className="set-v2-diag-head">
        <div className="set-v2-diag-title-wrap">
          <Cloud size={18} className="set-v2-accent-icon" />
          <div>
            <h4>Encrypted sync</h4>
            <p>
              Open your documents on another device. Text is encrypted here first, so the server
              only ever stores unreadable data. Lose the passphrase and the recovery code, and the
              text cannot be recovered.
            </p>
          </div>
        </div>
      </div>

      {status === 'checking' && <p className="set-v2-field-note">Checking…</p>}
      {status === 'unavailable' && <p className="set-v2-field-note">Could not reach the server. Try again later.</p>}

      {recoveryCode && (
        <div className="set-v2-form">
          <p className="set-v2-field-note">
            This is your recovery code. It is shown only now. Save it somewhere safe.
          </p>
          <code className="set-v2-field-note" style={{ wordBreak: 'break-all', fontSize: 15 }}>{recoveryCode}</code>
          <div className="set-v2-mt-20">
            <button type="button" className="set-v2-secondary-btn" onClick={copyCode}>
              <Copy size={14} /> Copy code
            </button>
          </div>
          <label className="set-v2-mt-20" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={savedCode} onChange={(e) => setSavedCode(e.target.checked)} />
            I have saved this recovery code
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
            <label htmlFor="vault-pass">Choose a passphrase (12+ characters)</label>
            <div className="set-v2-input-shell">
              <input id="vault-pass" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </div>
          </div>
          <div className="set-v2-input-field set-v2-mt-20">
            <label htmlFor="vault-confirm">Repeat the passphrase</label>
            <div className="set-v2-input-shell">
              <input id="vault-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <div className="set-v2-mt-20">
            <button type="submit" className="set-v2-primary-btn" disabled={busy || !passphrase || !confirm}>
              <Lock size={14} /> {busy ? 'Setting up…' : 'Turn on encrypted sync'}
            </button>
          </div>
        </form>
      )}

      {!recoveryCode && status === 'locked' && (
        <form className="set-v2-form" onSubmit={handleUnlock}>
          <p className="set-v2-field-note">Encrypted sync is on for this account, but this device is locked.</p>
          <div className="set-v2-input-field set-v2-mt-20">
            <label htmlFor="vault-secret">{useRecovery ? 'Recovery code' : 'Passphrase'}</label>
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
              {useRecovery ? 'Use passphrase instead' : 'Use recovery code instead'}
            </button>
          </div>
        </form>
      )}

      {!recoveryCode && status === 'unlocked' && (
        <div className="set-v2-form">
          <p className="set-v2-field-note">Encrypted sync is active on this device.</p>
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
