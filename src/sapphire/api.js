// One place for every call to Sapphire Bank's own backend, plus sign-in.
// Sign-in goes straight to Firebase Authentication for the sapphire-bank project, so these pages
// work even when the central Worker is unavailable. The Worker pages keep their own session.
import { firebaseWebApiKey, sapphireApiUrl } from '../sapphire-config';

const SESSION_KEY = 'sapphire-backend-session';

export function loadSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return session && session.expiresAt > Date.now() + 30_000 ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* pages still work without browser storage */ }
}

const SIGN_IN_MESSAGES = {
  EMAIL_NOT_FOUND: 'Email or password is incorrect.',
  INVALID_PASSWORD: 'Email or password is incorrect.',
  INVALID_LOGIN_CREDENTIALS: 'Email or password is incorrect.',
  USER_DISABLED: 'This login is not active yet. If you just registered, please wait for the bank to approve your application.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Please wait a few minutes and try again.',
};

export async function signIn(email, password) {
  let response;
  try {
    response = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(firebaseWebApiKey),
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('Could not reach Firebase sign-in. Check your internet connection.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data.error?.message || '').split(/[ :]/)[0];
    throw new Error(SIGN_IN_MESSAGES[code] || 'Sign-in failed. Check your email and password.');
  }
  const session = {
    token: data.idToken, email: data.email, uid: data.localId,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  };
  saveSession(session);
  return session;
}

// Calls the Sapphire backend. Throws an Error with .status and .code on failure.
export async function api(path, { token, method = 'GET', data, form } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (data) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(sapphireApiUrl + '/api' + path, {
      method, headers, credentials: 'omit', redirect: 'error',
      body: form || (data ? JSON.stringify(data) : undefined),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach the Sapphire backend at ' + sapphireApiUrl + '. Is it running (npm start)?');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) saveSession(null);
    const error = new Error(result.error?.message || 'The Sapphire backend returned HTTP ' + response.status + '.');
    error.status = response.status;
    error.code = result.error?.code;
    throw error;
  }
  return result;
}

// Admin only: opens a KYC document in a new tab (the download needs the admin's token).
export async function openKycDocument(token, requestId) {
  const response = await fetch(sapphireApiUrl + '/api/admin/kyc-requests/' + encodeURIComponent(requestId) + '/document', {
    headers: { Authorization: 'Bearer ' + token }, credentials: 'omit', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('Could not open the document (HTTP ' + response.status + ').');
  const url = URL.createObjectURL(await response.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
