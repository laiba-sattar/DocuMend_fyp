/**
 * emailLink.js — everything about the "sign in with a link" email, in one place.
 *
 * Two screens need these pieces:
 *   SocialSignIn.jsx   asks Firebase to send the link
 *   FinishSignIn.jsx   is where the link lands, and finishes the job
 *
 * The address is remembered in localStorage because the link is very often
 * opened in a different tab (or a different window) from the one that asked
 * for it, and Firebase insists on knowing which address the link was for.
 */
import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from 'firebase/auth';
import { firebaseAuth } from '../firebase';

const EMAIL_KEY = 'documend.signInEmail';
const NEXT_KEY = 'documend.afterSignInLink';

/** Where the emailed link lands. A page of its own, so nobody sees the form. */
export const LINK_LANDING_PATH = '/finish-sign-in';

/* ---------------------------------------------------------------------------
   Remembering the address
   ------------------------------------------------------------------------- */

export function rememberEmail(address) {
  try { window.localStorage.setItem(EMAIL_KEY, address); } catch { /* private window */ }
}

export function rememberedEmail() {
  try { return window.localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

export function forgetEmail() {
  try { window.localStorage.removeItem(EMAIL_KEY); } catch { /* nothing to do */ }
}

/* ---------------------------------------------------------------------------
   Firebase's words are for developers; these are for people.
   ------------------------------------------------------------------------- */

export function friendly(error) {
  const code = error?.code ?? '';
  if (code.includes('popup-closed')) return 'The Google window was closed before finishing.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google window. Allow pop-ups and try again.';
  if (code.includes('invalid-email')) return 'That email address does not look right.';
  if (code.includes('expired-action-code')) return 'That link has expired. Ask for a new one.';
  if (code.includes('invalid-action-code')) return 'That link has already been used. Ask for a new one.';
  if (code.includes('operation-not-allowed')) return 'Email link sign-in is switched off for this project.';
  if (code.includes('network')) return 'No connection. Check your internet and try again.';
  return error?.message?.replace(/^Firebase:\s*/, '') || 'That did not work. Please try again.';
}

/* ---------------------------------------------------------------------------
   Sending, and finishing
   ------------------------------------------------------------------------- */

/**
 * Ask Firebase to email the link. The link opens LINK_LANDING_PATH, not /login.
 *
 * `next` is where the reader should end up once the link has done its work:
 * the dashboard for an ordinary sign-in, /set-password when they came from
 * "Forgot password?". It is kept here rather than in the link itself, because
 * anything in the link is something a stranger could change.
 */
export async function sendLinkTo(address, { next = '/dashboard' } = {}) {
  const auth = firebaseAuth();
  if (!auth) throw new Error('Email sign-in is not set up yet.');
  await sendSignInLinkToEmail(auth, address, {
    url: `${window.location.origin}${LINK_LANDING_PATH}`,
    handleCodeInApp: true,
  });
  rememberEmail(address);
  try { window.localStorage.setItem(NEXT_KEY, next); } catch { /* private window */ }
}

/** Where to go after the link worked. Reading it also clears it. */
export function takeNextPath() {
  let next = '/dashboard';
  try {
    next = window.localStorage.getItem(NEXT_KEY) || next;
    window.localStorage.removeItem(NEXT_KEY);
  } catch { /* nothing stored */ }
  // Only our own pages, never an address that arrived from outside.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

/** Is this page address an emailed sign-in link? */
export function isEmailLink(href = window.location.href) {
  const auth = firebaseAuth();
  return Boolean(auth) && isSignInWithEmailLink(auth, href);
}

/**
 * Finishes the sign-in and returns the Firebase credential.
 * `askForAddress` is called only when the address was not remembered — for
 * example when the link is opened on a different device.
 */
export async function completeEmailLink({ askForAddress } = {}) {
  const auth = firebaseAuth();
  if (!auth) throw new Error('Email sign-in is not set up yet.');

  const href = window.location.href;
  const address = rememberedEmail() || (askForAddress ? askForAddress() : null);
  if (!address) throw new Error('The email address is needed to finish signing in.');

  const credential = await signInWithEmailLink(auth, address, href);
  forgetEmail();
  return credential;
}

/** Takes the one-time code out of the address bar so a reload cannot retry it. */
export function cleanUrl(path = LINK_LANDING_PATH) {
  window.history.replaceState({}, '', path);
}
