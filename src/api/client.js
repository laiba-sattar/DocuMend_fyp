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

let accessToken = null; // memory only: closing the tab forgets it

/* ---------------------------------------------------------------------------
   The refresh token
   ------------------------------------------------------------------------- */

function readRefreshToken() {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null; // private windows can refuse storage
  }
}

function writeRefreshToken(token) {
  try {
    if (token) window.localStorage.setItem(REFRESH_KEY, token);
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* nothing we can do; the session just won't survive a reload */
  }
}

export const hasStoredSession = () => Boolean(readRefreshToken());

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

async function send(path, { method = 'GET', body, token, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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

/** Swaps the refresh token for a new access token. Returns false when it is gone. */
async function refreshAccessToken() {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return false;
  try {
    const data = await send('/auth/refresh', { method: 'POST', body: { refreshToken } });
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    writeRefreshToken(null); // it is dead; stop pretending we are signed in
    return false;
  }
}

/** A request that needs an account, with one automatic retry after refreshing. */
async function authorized(path, options = {}) {
  if (!accessToken && !(await refreshAccessToken())) {
    throw new ApiError('Please sign in again.', { status: 401, code: 'signed_out' });
  }
  try {
    return await send(path, { ...options, token: accessToken });
  } catch (error) {
    if (error.status !== 401) throw error;
    if (!(await refreshAccessToken())) {
      throw new ApiError('Please sign in again.', { status: 401, code: 'signed_out' });
    }
    return send(path, { ...options, token: accessToken });
  }
}

/** Keeps both tokens after a signup or login. */
function keepSession(data) {
  accessToken = data.accessToken ?? null;
  if (data.refreshToken) writeRefreshToken(data.refreshToken);
  return data.user;
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

  /** The signed-in user, or null when this device has no live session. */
  async me() {
    if (!accessToken && !(await refreshAccessToken())) return null;
    const data = await authorized('/auth/me');
    return data.user;
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
};

export default api;
