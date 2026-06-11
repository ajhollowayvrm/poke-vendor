// Player accounts via Amazon Cognito — with zero dependencies. Cognito's
// unauthenticated user-pool APIs (SignUp, InitiateAuth, …) are CORS-enabled
// JSON-RPC endpoints, so plain fetch() replaces the whole Amplify SDK. The flow:
// sign up with email+password → confirm with the emailed 6-digit code → sign in
// (USER_PASSWORD_AUTH) → hold id/refresh tokens in localStorage → refresh quietly
// when the id token nears expiry. cloudSave.js sends the id token as a Bearer
// header; the Lambda verifies it and keys the save by the account.
import { AUTH_REGION, AUTH_CLIENT_ID } from './syncConfig'

const AUTH_KEY = 'poke-vendor-auth' // { email, sub, idToken, accessToken, refreshToken, expiresAt }

export function authConfigured() { return !!AUTH_CLIENT_ID }

// --- session storage + change events -----------------------------------------
function readSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null } catch { return null }
}
function writeSession(s) {
  const before = readSession()?.sub || null
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s))
  else localStorage.removeItem(AUTH_KEY)
  if ((s?.sub || null) !== before) emit() // identity changed (in/out) — not a quiet token refresh
}

const listeners = new Set()
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function emit() { const u = currentUser(); for (const fn of listeners) { try { fn(u) } catch {} } }

// Who is signed in (per the stored session — may be offline). null if nobody.
export function currentUser() {
  const s = readSession()
  return s ? { email: s.email, sub: s.sub } : null
}

// --- Cognito JSON-RPC ---------------------------------------------------------
// Friendlier wording for the error types players will actually hit; anything
// unmapped falls back to Cognito's own message.
const FRIENDLY = {
  NotAuthorizedException: 'Wrong email or password.',
  UserNotFoundException: 'No account with that email.',
  UsernameExistsException: 'An account with that email already exists — sign in instead.',
  CodeMismatchException: 'That code isn’t right — check the email and try again.',
  ExpiredCodeException: 'That code has expired — request a new one.',
  InvalidPasswordException: 'Password needs to be at least 8 characters.',
  LimitExceededException: 'Too many attempts — wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts — wait a few minutes and try again.',
}

async function cognito(action, payload) {
  let res, j
  try {
    res = await fetch(`https://cognito-idp.${AUTH_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(payload),
    })
    j = await res.json().catch(() => ({}))
  } catch {
    const e = new Error('Couldn’t reach the sign-in service — check your connection.')
    e.code = 'network'; throw e
  }
  if (!res.ok) {
    const type = String(j.__type || '').split('#').pop()
    const e = new Error(FRIENDLY[type] || j.message || 'Something went wrong — try again.')
    e.code = type || 'error'; throw e
  }
  return j
}

function jwtPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return {} }
}

// --- the flows ----------------------------------------------------------------
export async function signUp(email, password) {
  const j = await cognito('SignUp', {
    ClientId: AUTH_CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  })
  return { confirmed: !!j.UserConfirmed } // false → a code was emailed; confirm next
}

export async function confirmSignUp(email, code) {
  await cognito('ConfirmSignUp', { ClientId: AUTH_CLIENT_ID, Username: email, ConfirmationCode: String(code).trim() })
}

export async function resendCode(email) {
  await cognito('ResendConfirmationCode', { ClientId: AUTH_CLIENT_ID, Username: email })
}

export async function signIn(email, password) {
  const j = await cognito('InitiateAuth', {
    ClientId: AUTH_CLIENT_ID,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  })
  const r = j.AuthenticationResult
  if (!r?.IdToken) { // e.g. a NEW_PASSWORD_REQUIRED challenge — can't happen for self-signups
    const e = new Error('This account needs attention an admin can give it.')
    e.code = j.ChallengeName || 'challenge'; throw e
  }
  const p = jwtPayload(r.IdToken)
  writeSession({
    email: p.email || email,
    sub: p.sub,
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken,
    expiresAt: (p.exp || 0) * 1000,
  })
  return currentUser()
}

export function signOut() {
  const s = readSession()
  writeSession(null)
  // Best-effort: invalidate the refresh token server-side too.
  if (s?.refreshToken) cognito('RevokeToken', { ClientId: AUTH_CLIENT_ID, Token: s.refreshToken }).catch(() => {})
}

export async function forgotPassword(email) {
  await cognito('ForgotPassword', { ClientId: AUTH_CLIENT_ID, Username: email })
}

export async function confirmForgotPassword(email, code, newPassword) {
  await cognito('ConfirmForgotPassword', {
    ClientId: AUTH_CLIENT_ID, Username: email,
    ConfirmationCode: String(code).trim(), Password: newPassword,
  })
}

// A currently-valid id token for API calls, refreshing first if it's about to
// expire. null = not signed in, or the session is unrefreshable right now.
// Offline refresh failures KEEP the session (sync just no-ops until we're back);
// only a rejected refresh token (revoked/expired) signs the player out.
let refreshing = null
export async function getIdToken() {
  const s = readSession()
  if (!s) return null
  if (s.expiresAt - Date.now() > 60_000) return s.idToken
  if (!refreshing) refreshing = refreshTokens(s).finally(() => { refreshing = null })
  return refreshing
}

async function refreshTokens(s) {
  try {
    const j = await cognito('InitiateAuth', {
      ClientId: AUTH_CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: s.refreshToken },
    })
    const r = j.AuthenticationResult || {}
    if (!r.IdToken) throw Object.assign(new Error('no token'), { code: 'NotAuthorizedException' })
    const p = jwtPayload(r.IdToken)
    writeSession({ ...s, idToken: r.IdToken, accessToken: r.AccessToken || s.accessToken, expiresAt: (p.exp || 0) * 1000 })
    return r.IdToken
  } catch (e) {
    if (e.code !== 'network') writeSession(null) // really signed out (token revoked/expired)
    return null
  }
}
