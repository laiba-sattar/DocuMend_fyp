/**
 * ForgotPassword — password reset request, served at `/forgot-password`.
 *
 * Reached from the "Forgot password?" link on the login page. It wears the
 * same two-column auth card as LogIn and SignUp (dark story side, paper form
 * side) rather than the workspace chrome, because the reader is not signed in
 * yet.
 *
 * What it actually sends is the same one-time sign-in link the Email button
 * on the login page uses. There is no separate "reset token": the link puts
 * the reader back inside their own account, and lands them on /set-password
 * so they can choose a new one.
 *
 * Both links prove exactly the same thing — that this person can read that
 * inbox — so having two kinds would be two sets of tokens to expire and two
 * ways to get it wrong.
 *
 * The confirmation deliberately does not claim the address is registered --
 * saying "if that address has an account" is both the honest wording and the
 * standard one, since confirming which emails exist leaks accounts to anyone
 * who cares to ask.
 */
import { useEffect, useRef, useState } from 'react';
import './forgot-password.css';
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { navigate } from '../router';
import { friendly, sendLinkTo } from '../auth/emailLink';
import { isFirebaseConfigured } from '../firebase';

// Deliberately loose: enough to catch a typo, not enough to reject a valid
// but unusual address. The server is the only thing that can really tell.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// How long the resend button stays disabled, in seconds.
const RESEND_COOLDOWN = 30;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('idle'); // idle | sending | sent
  const [cooldown, setCooldown] = useState(0);
  const timers = useRef([]);

  // Any timer still pending when the reader navigates away would call
  // setState on an unmounted component.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  // Ticks the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  /** Sends the one-time link, and asks for /set-password once it has worked. */
  const send = async (address) => {
    await sendLinkTo(address, { next: '/set-password' });
  };

  const requestReset = async (event) => {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      setError('Enter the email address you signed up with.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('That does not look like an email address.');
      return;
    }
    if (!isFirebaseConfigured) {
      setError('Email sign-in is not set up on this copy of DocuMend yet.');
      return;
    }

    setError('');
    setStage('sending');
    try {
      await send(trimmed);
      setStage('sent');
      setCooldown(RESEND_COOLDOWN);
    } catch (problem) {
      setError(friendly(problem));
      setStage('idle');
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN); // start the wait immediately, whatever happens
    try {
      await send(email.trim());
    } catch (problem) {
      setError(friendly(problem));
    }
  };

  return (
    <main className="reset-shell">
      <section className="reset-card" aria-label="Reset your DocuMend password">
        {/* ---------------------------------------------------------------- */}
        {/* Story side                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="reset-story">
          <BrandMark size={30} className="reset-brand" />

          <div className="reset-story-copy">
            <p className="reset-kicker">
              <LockKeyhole size={13} />
              Account recovery
            </p>
            <h1>A locked door, not a lost room.</h1>
            <p className="reset-story-text">
              Your drafts are exactly where you left them. Reset the key and
              walk straight back in.
            </p>
          </div>

          <ul className="reset-assurances">
            <li><ShieldCheck size={15} /> The link expires shortly, and works once.</li>
            <li><LockKeyhole size={15} /> Your documents never leave this device.</li>
            <li><MailCheck size={15} /> Asking for a new link retires the old one.</li>
          </ul>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Form side                                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="reset-form-side">
          <button className="reset-back" type="button" onClick={() => navigate('/login')}>
            <ArrowLeft size={15} />
            Back to log in
          </button>

          {stage === 'sent' ? (
            <div className="reset-done">
              <span className="reset-done-icon"><MailCheck size={26} strokeWidth={1.6} /></span>
              <h2>Check your inbox</h2>
              <p className="reset-done-text">
                If <strong>{email.trim()}</strong> has an account, a sign-in link
                is on its way. Open it on this computer and you land straight on
                the page where you choose a new password. It may take a minute to
                arrive, and it is worth checking your spam folder.
              </p>
              {error && <p className="reset-error" role="alert">{error}</p>}

              <div className="reset-done-actions">
                <button type="button" className="reset-primary" onClick={() => navigate('/login')}>
                  Back to log in <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="reset-quiet"
                  onClick={resend}
                  disabled={cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
                </button>
              </div>

              <button
                type="button"
                className="reset-text-link"
                onClick={() => {
                  setStage('idle');
                  setCooldown(0);
                }}
              >
                Use a different email address
              </button>
            </div>
          ) : (
            <>
              <div className="reset-heading">
                <h2>Forgot your password?</h2>
                <p>
                  Give us the address you signed up with and we will send you a
                  link to set a new one.
                </p>
              </div>

              <form className="reset-form" onSubmit={requestReset} noValidate>
                <label className="reset-label" htmlFor="reset-email">Email address</label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  placeholder="you@university.edu"
                  className={`reset-input ${error ? 'is-invalid' : ''}`}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'reset-email-error' : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError('');
                  }}
                />
                {error && <p className="reset-error" id="reset-email-error" role="alert">{error}</p>}

                <button type="submit" className="reset-primary" disabled={stage === 'sending'}>
                  {stage === 'sending' ? 'Sending…' : (
                    <>Send reset link <ArrowRight size={15} /></>
                  )}
                </button>
              </form>

              <p className="reset-footnote">
                Remembered it after all?{' '}
                <button type="button" className="reset-text-link" onClick={() => navigate('/login')}>
                  Log in
                </button>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
