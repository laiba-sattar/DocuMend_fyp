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
import { setCurrentTier } from '../plans/limits';

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
   * The plan decides how many documents may exist and how much history is
   * kept, and those rules are checked outside React (storage/documents.js),
   * so the tier is pushed there whenever it changes.
   */
  useEffect(() => { setCurrentTier(user?.tier ?? 'BASIC'); }, [user?.tier]);

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

  /** Settings → the name shown around the app. */
  const updateProfile = useCallback(async (details) => {
    const account = await api.updateProfile(details);
    setUser(account);
    return account;
  }, []);

  /** Settings → sign out on every device, this one included. */
  const signOutEverywhere = useCallback(async () => {
    await api.signOutEverywhere();
    await api.logout(); // forget the tokens held in this browser too
    setUser(null);
    setStatus('signed-out');
  }, []);

  /** Settings → close the account. The caller clears local documents first. */
  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    await api.logout().catch(() => {}); // the session is already gone server-side
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
    /** Does this account have a password, or does it only sign in by link? */
    hasPassword: Boolean(user?.hasPassword),
    signIn,
    signUp,
    signInWithFirebase,
    signOut,
    updateProfile,
    signOutEverywhere,
    deleteAccount,
  }), [user, status, signIn, signUp, signInWithFirebase, signOut, updateProfile, signOutEverywhere, deleteAccount]);

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
