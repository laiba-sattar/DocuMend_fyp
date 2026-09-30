/**
 * RequireAccount.jsx — the workspace pages need an account.
 *
 * Three states, three answers:
 *   checking    the stored session is being verified → a quiet waiting screen
 *   signed-out  → send them to /login
 *   signed-in   → show the page
 *
 * The waiting screen matters: without it, someone who *is* signed in would see
 * the login page flash for a moment on every reload.
 */
import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { navigate } from '../router';
import './require-account.css';

export function RequireAccount({ children }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'signed-out') navigate('/login');
  }, [status]);

  if (status === 'signed-in') return children;

  return (
    <div className="account-gate" role="status">
      <span className="account-gate-spinner" aria-hidden="true" />
      <p>{status === 'checking' ? 'Opening your workspace…' : 'Taking you to the sign-in page…'}</p>
    </div>
  );
}

export default RequireAccount;
