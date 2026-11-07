/**
 * firebase.js — Firebase, kept to one job: proving who the user is.
 *
 * It signs people in with Google and sends the "here is your sign-in link"
 * email. The moment it hands us an ID token, that token goes to our own API
 * (POST /auth/firebase) and everything after that — the account, the session,
 * the documents — is ours. Nothing else in the app imports this file.
 *
 * The settings come from .env.local (VITE_FIREBASE_*), which the Firebase
 * console gives you under Project settings → Your apps → Web app. They are
 * public values: the app is protected by Firebase's authorized domains and by
 * our server checking every token, not by hiding these.
 *
 * Without them, `firebaseAuth()` returns null and the two buttons simply say
 * they are not set up — the rest of the app is unaffected.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

let auth = null;

/** The Firebase auth object, or null when the keys are missing. */
export function firebaseAuth() {
  if (!isFirebaseConfigured) return null;
  if (!auth) {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    auth.useDeviceLanguage(); // the sign-in email arrives in the reader's language
  }
  return auth;
}
