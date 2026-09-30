/**
 * firebaseToken.js — checking the ID token Firebase gives the browser.
 *
 * Firebase signs its ID tokens with Google's own keys and publishes the
 * matching certificates. So the server needs **no service-account key** and no
 * Admin SDK: it fetches the public certificates, checks the signature, and
 * checks that the token was issued for *our* Firebase project.
 *
 * That matters for deployment — one environment variable (FIREBASE_PROJECT_ID)
 * instead of a secret key file to mount into Docker or AWS.
 *
 * What is verified, in order:
 *   signature   against Google's current public certificates
 *   iss         https://securetoken.google.com/<project id>
 *   aud         <project id>          (a token for another app is refused)
 *   exp / iat   still valid
 *   sub         present — that is the user's permanent Firebase id
 */
import { importX509, jwtVerify } from 'jose';

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cache = { keys: null, expiresAt: 0 };

/** Google's certificates, kept until the Cache-Control header says they are stale. */
async function publicKeys() {
  if (cache.keys && Date.now() < cache.expiresAt) return cache.keys;

  const response = await fetch(CERT_URL);
  if (!response.ok) throw new Error('Google’s certificates could not be fetched.');
  const certificates = await response.json();

  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
  const keys = {};
  for (const [kid, pem] of Object.entries(certificates)) {
    keys[kid] = await importX509(pem, 'RS256');
  }
  cache = { keys, expiresAt: Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000 };
  return keys;
}

/**
 * Returns { uid, email, emailVerified, name, picture, provider } or throws.
 * `provider` is how they signed in: 'google.com', 'password' (email link)…
 */
export async function verifyFirebaseToken(idToken, projectId) {
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set on this server.');

  const keys = await publicKeys();
  const { payload } = await jwtVerify(
    idToken,
    async (header) => {
      const key = keys[header.kid];
      if (!key) throw new Error('Unknown signing key.');
      return key;
    },
    {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60, // a minute of clock drift between machines
    },
  );

  if (!payload.sub) throw new Error('The token has no user id.');
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    provider: payload.firebase?.sign_in_provider ?? 'unknown',
  };
}
