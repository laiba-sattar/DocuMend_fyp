/**
 * FinishSignIn.jsx — the page the emailed sign-in link opens.
 *
 * The whole point of this page is that the reader never sees a form. They
 * click the link in their inbox, land here, and by the time they have read
 * "Signing you in…" they are on the dashboard with their own name at the top.
 *
 * What happens here, in order:
 *   1. Firebase checks the one-time code in the address bar.
 *   2. It hands us an ID token; our API turns that into our own session.
 *   3. The address bar is cleaned (the code works only once) and we go
 *      straight to /dashboard.
 *
 * If anything goes wrong — an expired link, a link already used, the address
 * missing — this page says so plainly and offers the way back.
 */
import { useEffect, useRef, useState } from 'react';
import { MailCheck, MailX } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { navigate } from '../router';
import {
  cleanUrl,
  completeEmailLink,
  friendly,
  isEmailLink,
  takeNextPath,
} from '../auth/emailLink';
import './finish-sign-in.css';

export default function FinishSignIn() {
  const { signInWithFirebase } = useAuth();
  const [problem, setProblem] = useState('');
  const [greeting, setGreeting] = useState('');
  const started = useRef(false); // React runs effects twice in development

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!isEmailLink()) {
      // Somebody typed this address by hand, or the link has already been
      // swallowed by an earlier visit. Nothing to finish.
      navigate('/login');
      return;
    }

    (async () => {
      try {
        const credential = await completeEmailLink({
          askForAddress: () => window.prompt('Which email address was the link sent to?') || '',
        });
        cleanUrl(); // the code is spent; a reload must not try it again
        const idToken = await credential.user.getIdToken();
        const account = await signInWithFirebase(idToken);
        setGreeting(account.name?.trim().split(/\s+/)[0] || 'there');
        // Usually the dashboard; /set-password when they came here from
        // "Forgot password?".
        navigate(takeNextPath());
      } catch (error) {
        cleanUrl();
        setProblem(friendly(error));
      }
    })();
  }, [signInWithFirebase]);

  if (problem) {
    return (
      <div className="finish-signin" role="alert">
        <MailX size={30} strokeWidth={1.6} aria-hidden="true" />
        <h1>That link did not work</h1>
        <p>{problem}</p>
        <button type="button" onClick={() => navigate('/login')}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="finish-signin" role="status">
      {greeting ? (
        <>
          <MailCheck size={30} strokeWidth={1.6} aria-hidden="true" />
          <h1>Welcome, {greeting}</h1>
          <p>Opening your workspace…</p>
        </>
      ) : (
        <>
          <span className="finish-signin-spinner" aria-hidden="true" />
          <h1>Signing you in…</h1>
          <p>One moment — checking the link from your email.</p>
        </>
      )}
    </div>
  );
}
