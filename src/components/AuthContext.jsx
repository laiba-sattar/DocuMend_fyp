/**
 * AuthContext.jsx — who is signed in, for the whole app.
 *
 *   const { user, status, signUp, signIn, signOut } = useAuth();
 *
 * status: 'checking' while the stored session is being verified,
 *         'signed-in' | 'signed-out' after that.
 *
 * On start-up the provider asks the server once ("is this refresh token still
 * good?"). While that is happening the workspace shows a small waiting screen
 * rather than flashing the login page at someone who is in fact signed in.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, hasStoredSession } from '../api/client';
import { startSync, stopSync } from '../sync/metadata';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(hasStoredSession() ? 'checking' : 'signed-out');

  useEffect(() => {
    if (status !== 'checking') return undefined;
    let alive = true;
    api.me()
      .then((account) => {
        if (!alive) return;
        setUser(account);
        setStatus(account ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (!alive) return;
        // The server may simply be down; the session is not necessarily gone,
        // but there is nothing to show until it answers.
        setUser(null);
        setStatus('signed-out');
      });
    return () => { alive = false; };
  }, [status]);

  /**
   * The document LIST follows the account; the text stays on this device.
   * Starting this here, rather than in a page, means it runs whichever screen
   * the reader happens to open first.
   */
  useEffect(() => {
    if (status === 'signed-in') startSync();
    else if (status === 'signed-out') stopSync();
  }, [status]);

  const signIn = useCallback(async (credentials) => {
    const account = await api.login(credentials);
    setUser(account);
    setStatus('signed-in');
    return account;
  }, []);

  const signUp = useCallback(async (details) => {
    const account = await api.signup(details);
    setUser(account);
    setStatus('signed-in');
    return account;
  }, []);

  /** After Firebase proves who they are — Google, or the emailed link. */
  const signInWithFirebase = useCallback(async (idToken) => {
    const account = await api.loginWithFirebase(idToken);
    setUser(account);
    setStatus('signed-in');
    return account;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    isSignedIn: status === 'signed-in',
    /** The name shown in the sidebar and the dashboard greeting. */
    firstName: user?.name?.trim().split(/\s+/)[0] ?? '',
    /** 'BASIC' | 'PREMIUM' | 'ENTERPRISE' */
    tier: user?.tier ?? 'BASIC',
    signIn,
    signUp,
    signInWithFirebase,
    signOut,
  }), [user, status, signIn, signUp, signInWithFirebase, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** Is this plan at least `minimum`? `useFeature('PREMIUM')` in a page. */
const TIER_ORDER = { BASIC: 0, PREMIUM: 1, ENTERPRISE: 2 };
export function useFeature(minimum) {
  const { tier } = useAuth();
  return (TIER_ORDER[tier] ?? 0) >= (TIER_ORDER[minimum] ?? 0);
}

export default AuthContext;
