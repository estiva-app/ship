/**
 * Signing in with Estiva ID, from a browser, on another origin (PEEK-47).
 *
 * Authorization code with PKCE, because nothing simpler works: Estiva ID's
 * session cookie is `SameSite=Lax` and it serves no CORS, so a cross-origin
 * `fetch` for a token is blocked twice over. Both are deliberate on the origin
 * that holds every custodied key, so the redirect flow is the way in (PEEK-90).
 *
 * ## This is one signer among several, on purpose
 *
 * Ship depends on a `Signer`, not on Estiva ID (PEEK-44). Everything here
 * produces a token that `estivaIdSigner` consumes; the anonymous per-browser
 * key stays exactly as it was. An app that only worked for people with an
 * Estiva account would undercut the claim the repo is built to demonstrate.
 *
 * ## Tokens are short-lived and there is no refresh
 *
 * `JWT_TTL_SECONDS` is an hour and PEEK-90 issues no refresh token, so when one
 * expires the answer is to run the redirect again. That is silent when the
 * Estiva ID session is still live — `/authorize` bounces straight back without
 * asking anything — and it costs a page navigation and whatever was on screen.
 * PEEK-108 is what removes that cost; until it lands, an expiry mid-session is
 * an interruption the shell can make quiet but cannot make free.
 *
 * A hidden iframe would avoid the navigation and does not work: `SameSite=Lax`
 * withholds the cookie from anything that is not a top-level navigation, which
 * is precisely the property that makes the redirect flow necessary.
 *
 * ## The shell drives this now (PEEK-119)
 *
 * `beginSignIn(config, { silent: true })` is the probe an app boots on. See
 * `shell/contract.ts` and `estiva-id/docs/AUTH-SHELL.md`.
 */

import { clearGuard, markGuard, reasonForCallbackError, type ShellReason } from './shell/contract'

/** Where the token and its metadata live between page loads. */
const SESSION_KEY = 'ship.estiva-id.session'
/** The PKCE verifier, in flight. Per-tab: the flow starts and ends in one tab. */
const VERIFIER_KEY = 'ship.estiva-id.verifier'
const STATE_KEY = 'ship.estiva-id.state'
/**
 * The hash route to restore afterwards.
 *
 * Ship routes on `location.hash`, and `redirectUri()` deliberately carries no
 * fragment because it has to match the registered URI exactly. The fragment is
 * lost at the first navigation to `/authorize` — not through the redirect
 * chain, so nothing brings it back — which meant every deep link into Ship
 * dropped its route on entry. Harmless when only a sign-in click did it;
 * unmissable once the shell probes on every cold load (PEEK-123).
 */
const ROUTE_KEY = 'ship.estiva-id.route'

export interface EstivaIdSession {
  token: string
  pubkey: string
  /** Epoch ms. Checked before use — a token past this is not offered. */
  expiresAt: number
}

export interface EstivaIdConfig {
  /** Origin of the identity service, e.g. `https://id.estiva.app`. */
  base: string
  /** This app's `client_id` in `app_credentials`. */
  clientId: string
}

const base64url = (bytes: Uint8Array) => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomUrlSafe = (length: number) =>
  base64url(crypto.getRandomValues(new Uint8Array(length)))

/** base64url(sha256(verifier)) — RFC 7636 §4.2. */
async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/**
 * Where Estiva ID sends people back to.
 *
 * The app's own origin and path, with no query — it must match a registered
 * `redirect_uri` **exactly**, since an identity provider that prefix-matches is
 * an open redirector handing out authorization codes.
 */
export function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/** A stored session, if there is one and it has not expired. */
export function currentSession(): EstivaIdSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as EstivaIdSession
    // A minute of slack: a token that expires mid-request is worse than one
    // refreshed slightly early, and re-running the flow is silent anyway.
    if (session.expiresAt - 60_000 <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY)
}

/**
 * Send the person to Estiva ID.
 *
 * Navigates away, so nothing after this runs. `state` is checked on the way
 * back — it is what stops somebody feeding this app a code they obtained
 * elsewhere.
 */
export async function beginSignIn(
  config: EstivaIdConfig,
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  const verifier = randomUrlSafe(32)
  const state = randomUrlSafe(16)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const url = new URL('/authorize', config.base)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', await challengeFor(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)

  /**
   * A silent attempt asks not to be prompted (PEEK-117): a browser with no
   * session comes straight back with `error=login_required` rather than
   * landing on the identity origin's sign-in page.
   *
   * The guard is marked **before** navigating, because nothing after this line
   * runs. That marker is what makes this one attempt instead of a bounce.
   */
  if (silent) {
    url.searchParams.set('prompt', 'none')
    markGuard(sessionStorage, Date.now())
  }

  // Kept locally for the same reason `state` is not widened into a payload:
  // what comes back from the identity service is compared, never trusted.
  if (window.location.hash) sessionStorage.setItem(ROUTE_KEY, window.location.hash)

  window.location.assign(url.toString())
}

/**
 * Put the person back on the route they opened.
 *
 * Single-use, and applied before the app boots so the router reads the restored
 * hash rather than the default. Assigning `location.hash` does not reload.
 */
export function restoreRoute(): void {
  const hash = sessionStorage.getItem(ROUTE_KEY)
  if (!hash) return
  sessionStorage.removeItem(ROUTE_KEY)
  if (!window.location.hash) window.history.replaceState({}, '', `${window.location.pathname}${hash}`)
}

/**
 * Leave for Estiva ID to end the session there (PEEK-122).
 *
 * `signOut()` only forgets this app's token; the `estiva_id_session` cookie is
 * untouched, so the shell's silent probe succeeds on the next boot and puts the
 * person straight back in. The cookie can only be reached by going there.
 */
export function beginSignOut(config: EstivaIdConfig): void {
  signOut()
  const url = new URL('/logout', config.base)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('post_logout_redirect_uri', redirectUri())
  window.location.assign(url.toString())
}

export type SignInOutcome =
  | { kind: 'none' }
  | { kind: 'signed-in'; session: EstivaIdSession }
  /**
   * `reason` is for a person; `shellReason` is for the shell, which decides
   * from it whether to offer a passkey or say that nobody here can help.
   * `login_required` arrives on this path too — it is the expected negative
   * answer to a silent probe, not a fault.
   */
  | { kind: 'failed'; reason: string; shellReason: ShellReason }

/**
 * Finish the flow if this page load is the one coming back.
 *
 * Call once at boot, before deciding which signer to use. The query is cleared
 * either way: a code is single-use, and leaving it in the address bar puts a
 * spent credential in history and in every screenshot.
 */
export async function completeSignIn(config: EstivaIdConfig): Promise<SignInOutcome> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  const state = params.get('state')

  if (!code && !error) return { kind: 'none' }

  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  clearQuery()

  // Estiva ID sends people back with `?error=` for anything it can attribute to
  // the app rather than to the request — a suspended identity, most likely.
  if (error) {
    return {
      kind: 'failed',
      reason: params.get('error_description') ?? error,
      shellReason: reasonForCallbackError(error),
    }
  }

  if (!expectedState || state !== expectedState) {
    return { kind: 'failed', reason: 'That sign-in did not start here.', shellReason: 'exchange_failed' }
  }
  if (!verifier) {
    return { kind: 'failed', reason: 'That sign-in did not start here.', shellReason: 'exchange_failed' }
  }

  const response = await fetch(`${config.base.replace(/\/+$/, '')}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      clientId: config.clientId,
      redirectUri: redirectUri(),
      codeVerifier: verifier,
    }),
  })

  if (!response.ok) {
    // Every refusal is `invalid_grant` by design — the specific reason is in
    // Estiva ID's audit log, not in this reply.
    return {
      kind: 'failed',
      reason: 'Could not complete sign-in. Try again.',
      shellReason: 'exchange_failed',
    }
  }

  const body = (await response.json()) as { access_token: string; pubkey: string; expires_in: number }
  const session: EstivaIdSession = {
    token: body.access_token,
    pubkey: body.pubkey,
    expiresAt: Date.now() + body.expires_in * 1000,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  // The attempt worked, so the next boot is entitled to a fresh silent one.
  clearGuard(sessionStorage)
  return { kind: 'signed-in', session }
}

/** Drop `?code=…` and friends without reloading or touching the hash route. */
function clearQuery(): void {
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
}
