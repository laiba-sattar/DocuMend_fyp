/**
 * SocialSignIn.jsx — the two buttons under the sign-in form: Google and Email.
 *
 * Both go through Firebase, and both end the same way: Firebase hands the
 * browser an ID token, our API checks it and answers with our own session.
 * Firebase only ever proves who someone is; the account lives in our database.
 *
 *   Google  a popup, one click, done.
 *   Email   Firebase emails a one-time link. That link opens /finish-sign-in —
 *           a page with no form on it — which signs the reader in and goes
 *           straight to the dashboard. See pages/FinishSignIn.jsx.
 *
 * Older emails (sent before that page existed) point at /login instead, so the
 * effect below quietly forwards them to the right place.
 */
import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from '../firebase';
import { useAuth } from './AuthContext';
import { navigate } from '../router';
import { LINK_LANDING_PATH, friendly, isEmailLink, sendLinkTo } from '../auth/emailLink';
import './social-sign-in.css';

export function SocialSignIn({ onMessage = () => {}, buttonClass = 'login-social' }) {
  const { signInWithFirebase } = useAuth();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState('');
  const forwarded = useRef(false);

  // --- an old link that still points here ----------------------------------
  useEffect(() => {
    if (forwarded.current || !isEmailLink()) return;
    forwarded.current = true;
    navigate(`${LINK_LANDING_PATH}${window.location.search}${window.location.hash}`);
  }, []);

  // --- Google ---------------------------------------------------------------
  const continueWithGoogle = async () => {
    const auth = firebaseAuth();
    if (!auth) return onMessage('Google sign-in is not set up yet.');
    if (busy) return;
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' }); // let people pick the account
      const credential = await signInWithPopup(auth, provider);
      const account = await signInWithFirebase(await credential.user.getIdToken());
      onMessage(`Welcome, ${account.name.split(' ')[0]}. Opening your workspace…`);
      window.setTimeout(() => navigate('/dashboard'), 600);
    } catch (error) {
      onMessage(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  // --- the email link -------------------------------------------------------
  const sendLink = async (event) => {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    setBusy(true);
    try {
      await sendLinkTo(address);
      onMessage(`A sign-in link is on its way to ${address}. Open it and you land straight in your workspace.`);
      setAsking(false);
      setEmail('');
    } catch (error) {
      onMessage(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  const ready = isFirebaseConfigured;

  return (
    <div className="social-signin">
      <div className="social-signin-row">
        <button
          type="button"
          className={buttonClass}
          onClick={continueWithGoogle}
          disabled={!ready || busy}
          title={ready ? 'Continue with your Google account' : 'Google sign-in is not set up yet'}
        >
          <GoogleMark />
          Google
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => setAsking((open) => !open)}
          disabled={!ready || busy}
          title={ready ? 'Get a sign-in link by email' : 'Email sign-in is not set up yet'}
        >
          <Mail size={17} strokeWidth={1.8} />
          Email
        </button>
      </div>

      {asking && (
        <form className="social-email-form" onSubmit={sendLink}>
          <label htmlFor="social-email">
            <span className="dash-sr">Your email address</span>
            <input
              id="social-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send me a link'}
          </button>
          <p className="social-email-note">
            We email you a one-time link — no password to remember. Opening it takes
            you straight to your workspace.
          </p>
        </form>
      )}
    </div>
  );
}

/** Google's mark. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2H12z" />
      <path fill="#34A853" d="M6.6 14.3 5.9 14l-2.3 1.8A9.9 9.9 0 0 0 12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3z" />
      <path fill="#4A90E2" d="M3.6 8.2A9.9 9.9 0 0 0 2.5 12c0 1.4.3 2.7.9 3.8L6.6 13a5.9 5.9 0 0 1 0-3.8z" />
      <path fill="#FBBC05" d="M12 6.5c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a9.9 9.9 0 0 0-8.4 4.8L6.6 9.2C7.4 6.7 9.5 6.5 12 6.5z" />
    </svg>
  );
}

export default SocialSignIn;
