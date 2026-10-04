/**
 * client.js — the only place the app talks to the server.
 *
 * Everything about the API lives here: where it is, how the token is sent,
 * and what happens when the token has expired. Pages never call fetch.
 *
 *   await api.signup({ email, name, password })
 *   await api.login({ email, password })
 *   await api.me()
 *   await api.saveDocumentMeta(id, { title, … })
 *
 * The address comes from VITE_API_URL, so the same build runs against
 * localhost, Docker or the cloud without a single code change.
 *
 * Two tokens (see api/src/lib/tokens.js):
 *   access token   short-lived, kept in memory only
 *   refresh token  long-lived, kept in localStorage so a refresh of the page
 *                  does not sign the user out
 *
 * When a request comes back 401, the client quietly trades the refresh token
 * for a new access token and tries once more. The page never sees it.
 */

const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const REFRESH_KEY = 'documend.refreshToken';
const SESSION_ONLY_KEY = 'documend.sessionOnly';
const USER_KEY = 'documend.cachedUser';

let accessToken = null; // memory only: closing the tab forgets it

/* ---------------------------------------------------------------------------
   The refresh token

   Where it is kept is what the login page's "Remember me on this device"
   decides. That checkbox used to set a variable nobody read, so the answer was
   always localStorage and the box was decoration — which is a bad thing for a
   box about a shared computer to be. Unticked now means sessionStorage, and
   sessionStorage is emptied when the tab closes, so the session goes with it.
   ------------------------------------------------------------------------- */

/** Has this tab been told not to remember the session? */
function sessionOnly() {
  try {
    return window.sessionStorage.getItem(SESSION_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Sets where the next token is kept. Call it before signing in.
 *
 * The flag itself lives in sessionStorage, so a page reload keeps the same
 * answer and closing the tab forgets both the flag and the token together.
 */
export function rememberSession(remember) {
  try {
    if (remember) window.sessionStorage.removeItem(SESSION_ONLY_KEY);
    else window.sessionStorage.setItem(SESSION_ONLY_KEY, '1');
  } catch {
    /* a private window may refuse; the default (remember) then applies */
  }
  // Anything already stored moves to the store the new answer names, so
  // signing in again on a shared computer really does change where it lives.
  const existing = readRefreshToken();
  if (existing) writeRefreshToken(existing);
  const profile = readStored(USER_KEY);
  if (profile) writeStored(USER_KEY, profile);
}

function readStored(key) {
  try {
    // sessionStorage first: it is the more private of the two, so a value
    // there wins over a stale one left in localStorage.
    return window.sessionStorage.getItem(key)
      ?? window.localStorage.getItem(key);
  } catch {
    return null; // private windows can refuse storage
  }
}

function writeStored(key, value) {
  try {
    const keep = sessionOnly() ? window.sessionStorage : window.localStorage;
    const other = sessionOnly() ? window.localStorage : window.sessionStorage;
    // Always clear the other one, or signing out of a remembered session
    // could leave a usable value behind in the store nobody looked at.
    other.removeItem(key);
    if (value) keep.setItem(key, value);
    else keep.removeItem(key);
  } catch {
    /* nothing we can do; the session just won't survive a reload */
  }
}

const readRefreshToken = () => readStored(REFRESH_KEY);

function writeRefreshToken(token) {
  writeStored(REFRESH_KEY, token);
  if (!token) writeStored(USER_KEY, null); // no session, so no profile to remember
}

export const hasStoredSession = () => Boolean(readRefreshToken());

/**
 * The last profile the server sent (name, email, plan). It lets a returning
 * reader open their workspace with no connection: the documents are on this
 * device anyway, and the server is asked again as soon as it can be reached.
 * It is kept in the same place as the refresh token, so it goes when they do.
 */
function rememberUser(user) {
  if (user) writeStored(USER_KEY, JSON.stringify(user));
  return user;
}

export function cachedUser() {
  try {
    return JSON.parse(readStored(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   The request
   ------------------------------------------------------------------------- */

/** An error the pages can show as-is. */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? 'error';
  }
}

async function send(path, { method = 'GET', body, rawBody, headers: extraHeaders, token, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(rawBody ? { 'content-type': 'application/octet-stream' } : {}),
        ...(extraHeaders ?? {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : rawBody,
    });
  } catch {
    throw new ApiError('DocuMend could not reach the server. Check your connection.', { code: 'offline' });
  }

  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.message ?? 'Something went wrong.', { status: response.status, code: data.error });
  }
  return data;
}

/** Could not reach the server, or it is down. That says nothing about the session. */
const unreachable = (error) => error?.code === 'offline' || (error?.status ?? 0) >= 500;

/**
 * Swaps the refresh token for a new access token.
 *
 *   'ok'       there is a fresh access token
 *   'gone'     the server refused the refresh token (or there is none)
 *   'offline'  the server could not be asked
 *
 * Only 'gone' forgets the session. This used to forget it on any failure,
 * including having no connection, so opening the app once offline signed the
 * reader out for good.
 */
async function refreshAccessToken() {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return 'gone';
  try {
    const data = await send('/auth/refresh', { method: 'POST', body: { refreshToken } });
    accessToken = data.accessToken;
    return 'ok';
  } catch (error) {
    if (unreachable(error)) return 'offline';
    accessToken = null;
    writeRefreshToken(null); // it is dead; stop pretending we are signed in
    return 'gone';
  }
}

const signedOut = () => new ApiError('Please sign in again.', { status: 401, code: 'signed_out' });
const cannotReach = () => new ApiError('DocuMend could not reach the server. Check your connection.', { code: 'offline' });

/** Makes sure there is an access token, or throws the right error for why not. */
async function ensureAccessToken() {
  if (accessToken) return;
  const outcome = await refreshAccessToken();
  if (outcome === 'offline') throw cannotReach();
  if (outcome === 'gone') throw signedOut();
}

/** A request that needs an account, with one automatic retry after refreshing. */
async function authorized(path, options = {}) {
  await ensureAccessToken();
  try {
    return await send(path, { ...options, token: accessToken });
  } catch (error) {
    if (error.status !== 401) throw error;
    const outcome = await refreshAccessToken();
    if (outcome === 'offline') throw cannotReach();
    if (outcome === 'gone') throw signedOut();
    return send(path, { ...options, token: accessToken });
  }
}

/** Keeps both tokens, and the profile, after a signup or login. */
function keepSession(data) {
  accessToken = data.accessToken ?? null;
  if (data.refreshToken) writeRefreshToken(data.refreshToken);
  return rememberUser(data.user);
}

/* ---------------------------------------------------------------------------
   What the app uses
   ------------------------------------------------------------------------- */

export const api = {
  baseUrl: BASE_URL,

  /** Is the server up? Used by the sign-in screens to explain a failure. */
  health: () => send('/health'),

  signup: async ({ email, name, password }) =>
    keepSession(await send('/auth/signup', { method: 'POST', body: { email, name, password } })),

  login: async ({ email, password }) =>
    keepSession(await send('/auth/login', { method: 'POST', body: { email, password } })),

  /**
   * Google, or the emailed sign-in link. Both arrive here as a Firebase ID
   * token; the server checks it and answers with our own session.
   */
  loginWithFirebase: async (idToken) =>
    keepSession(await send('/auth/firebase', { method: 'POST', body: { idToken } })),

  /**
   * The signed-in user, or null when this device has no live session.
   * Throws an error with code 'offline' when the server cannot be reached,
   * which is different from having no session: see cachedUser().
   */
  async me() {
    if (!accessToken) {
      const outcome = await refreshAccessToken();
      if (outcome === 'gone') return null;
      if (outcome === 'offline') throw cannotReach();
    }
    const data = await authorized('/auth/me');
    return rememberUser(data.user);
  },

  /**
   * Sets a new password for the signed-in account.
   *
   * `currentPassword` is only needed when the account already has one — after
   * arriving by the emailed link there is nothing to type. Our own refresh
   * token rides along so that this device stays signed in while every other
   * device is signed out.
   */
  setPassword: ({ currentPassword, newPassword }) =>
    authorized('/auth/password', {
      method: 'POST',
      body: {
        ...(currentPassword ? { currentPassword } : {}),
        newPassword,
        refreshToken: readRefreshToken() ?? undefined,
      },
    }),

  /** Changes the name shown around the app. The email address is fixed. */
  updateProfile: async ({ name }) => rememberUser((await authorized('/auth/me', { method: 'PATCH', body: { name } })).user),

  /** Ends every session on every device, this one included. */
  signOutEverywhere: () => authorized('/auth/logout-all', { method: 'POST' }),

  /** Closes the account on the server. Documents live in the browser. */
  deleteAccount: () => authorized('/auth/me', { method: 'DELETE' }),

  async logout() {
    const refreshToken = readRefreshToken();
    accessToken = null;
    writeRefreshToken(null);
    if (refreshToken) {
      // Tell the server too, so the token cannot be used again from anywhere.
      await send('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    }
  },

  listDocumentMeta: () => authorized('/documents'),

  saveDocumentMeta: (id, meta) => authorized(`/documents/${encodeURIComponent(id)}`, { method: 'PUT', body: meta }),

  deleteDocumentMeta: (id) => authorized(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** The wrapped vault keys — ciphertext only (see src/storage/vault.js). */
  getVault: () => authorized('/vault'),

  saveVault: (record) => authorized('/vault', { method: 'PUT', body: record }),

  /** Uploads one document's ciphertext. A 409 means another device wrote a newer version first. */
  putBlob: (id, bytes, { iv, expectedVersion }) =>
    authorized(`/documents/${encodeURIComponent(id)}/blob`, {
      method: 'PUT',
      rawBody: bytes,
      headers: { 'x-iv': iv, 'x-expected-version': String(expectedVersion) },
    }),

  getBlob: (id) => authorized(`/documents/${encodeURIComponent(id)}/blob`),

  deleteBlob: (id) => authorized(`/documents/${encodeURIComponent(id)}/blob`, { method: 'DELETE' }),
};

export default api;
