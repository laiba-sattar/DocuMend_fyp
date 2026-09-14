/**
 * SetPassword.jsx — "choose a new password", at /set-password.
 *
 * This is where "Forgot password?" ends. By the time anyone gets here they are
 * already signed in: the emailed link proved they can read that inbox, and
 * <RequireAccount> would have turned them away otherwise. So there is nothing
 * to prove a second time — unless the account already has a password, in which
 * case the current one is asked for, the way any settings page would.
 *
 * Saving signs every *other* device out. If the password was changed because
 * someone else might have had it, leaving their session alive would make the
 * change pointless.
 */
import { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../components/AuthContext';
import { navigate } from '../router';
import './set-password.css';

const MINIMUM = 8;

export default function SetPassword() {
  const { user, firstName } = useAuth();
  const hasPassword = Boolean(user?.hasPassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;

    if (next.length < MINIMUM) {
      setError(`Use at least ${MINIMUM} characters.`);
      return;
    }
    if (next !== again) {
      setError('The two passwords do not match.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await api.setPassword({
        currentPassword: hasPassword ? current : undefined,
        newPassword: next,
      });
      setDone(true);
      window.setTimeout(() => navigate('/dashboard'), 1400);
    } catch (problem) {
      setError(problem?.message ?? 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="setpw-shell">
        <section className="setpw-card setpw-centered" role="status">
          <span className="setpw-tick"><Check size={26} strokeWidth={2.2} /></span>
          <h1>Password saved</h1>
          <p>Use it the next time you sign in. Every other device has been signed out.</p>
          <p className="setpw-quiet">Taking you to your workspace…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="setpw-shell">
      <section className="setpw-card" aria-label="Choose a new password">
        <span className="setpw-icon"><KeyRound size={22} strokeWidth={1.7} /></span>

        <h1>{hasPassword ? 'Change your password' : 'Choose a password'}</h1>
        <p className="setpw-lead">
          {firstName ? `You are signed in, ${firstName}. ` : 'You are signed in. '}
          {hasPassword
            ? 'Pick something you have not used elsewhere.'
            : 'Set one now and you can sign in without waiting for an email next time.'}
        </p>

        <form className="setpw-form" onSubmit={save} noValidate>
          {hasPassword && (
            <label className="setpw-field">
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                placeholder="Your current password"
              />
            </label>
          )}

          <label className="setpw-field">
            <span>New password</span>
            <div className="setpw-with-button">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={next}
                onChange={(event) => { setNext(event.target.value); if (error) setError(''); }}
                placeholder={`At least ${MINIMUM} characters`}
              />
              <button
                type="button"
                onClick={() => setShow((open) => !open)}
                title={show ? 'Hide the password' : 'Show the password'}
                aria-label={show ? 'Hide the password' : 'Show the password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="setpw-field">
            <span>Type it once more</span>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={again}
              onChange={(event) => { setAgain(event.target.value); if (error) setError(''); }}
              placeholder="The same password again"
            />
          </label>

          {error && <p className="setpw-error" role="alert">{error}</p>}

          <button type="submit" className="setpw-save" disabled={busy}>
            {busy ? 'Saving…' : <>Save password <ArrowRight size={15} /></>}
          </button>
        </form>

        <button type="button" className="setpw-skip" onClick={() => navigate('/dashboard')}>
          Not now — go to my workspace
        </button>
      </section>
    </main>
  );
}
