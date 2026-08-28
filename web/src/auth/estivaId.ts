/**
 * Sign-in for the React app (REW-2), over `@estiva-app/identity`.
 *
 * `web/src/api/store.ts` has said what this file is for since REW-1: "Sign-in
 * through Estiva ID replaces this signer in REW-2; `Store` cannot tell the
 * difference, which is the point of the signer seam." This is that.
 *
 * Everything that decides *whether somebody is signed in* is the package's. What
 * is here is Ship's five choices, and one of them is the reason the package has a
 * `pendingStore` parameter at all.
 *
 * ## Two stores, with different lifetimes on purpose
 *
 * The **session** lives in `localStorage`, so signing in once outlives the tab.
 * The **in-flight PKCE credentials** — verifier, state, returnTo, and the
 * silent-attempt guard — live in `sessionStorage`, because the flow starts and
 * ends in one tab and a genuinely new tab is entitled to a fresh attempt.
 *
 * The package assumed one store until Ship was wired, because it was extracted
 * from Peek, which uses one. That is the "a library pulled from one app comes out
 * shaped like that app" failure SHA-4 names.
 *
 * ## The route is a fragment, which is why `returnTo` is not the whole story
 *
 * Ship routes on `location.hash`, and `redirectUri()` carries no fragment
 * because it must match a registered URI **exactly**. The fragment is lost at
 * the first navigation to `/authorize` and nothing brings it back, so it is
 * carried in `returnTo` and reapplied before the app boots (PEEK-123).
 */
import { createEstivaId, type StoredToken } from '@estiva-app/identity'
import { ID_CONFIG } from '../config'

/**
 * Leaving the page, as a replaceable binding.
 *
 * jsdom implements no navigation and will not let `location.assign` be spied on,
 * so without this seam "we left for Estiva ID" and "we did nothing" are the same
 * observation in a test — and telling those apart is most of what the boot
 * decision does.
 *
 * The package made `navigate` a parameter for exactly this reason. This is that
 * parameter, one level down.
 */
let navigateTo: (url: string) => void = (url) => window.location.assign(url)

/** Tests only. Production never calls this. */
export function setNavigate(fn: (url: string) => void): void {
  navigateTo = fn
}

/**
 * The client, or null when this build offers no sign-in.
 *
 * An empty `ID_BASE` is a real mode, not a broken one: the app runs
 * anonymous-only, reading what the relay lets an anonymous reader see. Local
 * builds are this by default, so a local build cannot reach production identity
 * by accident. Every function below is a no-op in that mode rather than a throw.
 */
const client = ID_CONFIG
  ? createEstivaId({
      base: ID_CONFIG.base,
      clientId: ID_CONFIG.clientId,
      // No query and no fragment — compared exact-string upstream, and an
      // identity provider that prefix-matched would be an open redirector.
      redirectUri: () => `${window.location.origin}${window.location.pathname}`,
      storage: () => (typeof localStorage === 'undefined' ? null : localStorage),
      pendingStore: () => (typeof sessionStorage === 'undefined' ? null : sessionStorage),
      keyPrefix: 'ship.estiva-id',
      navigate: (url) => navigateTo(url),
    })
  : null

/** Whether this build offers sign-in at all. */
export const signInAvailable = client !== null

/** A token that is present *and* still usable, or null. */
export function currentToken(): StoredToken | null {
  // A minute of slack, which is Ship's own choice: a token that expires
  // mid-request is worse than one refreshed slightly early, and re-running the
  // flow is silent when the Estiva ID session is still live.
  return client?.validToken(Date.now() + 60_000) ?? null
}

export function signedIn(): boolean {
  return currentToken() !== null
}

/** For `estivaIdSigner`'s `renew`, so a 401 from `/sign` is an invisible retry. */
export async function renew(): Promise<string | null> {
  const next = await client?.refreshAccessToken()
  return next?.accessToken ?? null
}

/** Send the person to Estiva ID, carrying the hash route in `returnTo`. */
export async function beginSignIn(options: { silent?: boolean } = {}): Promise<void> {
  await client?.beginSignIn(window.location.hash || '#/', options)
}

/**
 * Leave for Estiva ID to end the session *there* (PEEK-122).
 *
 * Clearing the local token is not signing out: the `estiva_id_session` cookie on
 * the identity origin survives it, so the next silent probe succeeds and puts the
 * person straight back in. The cookie can only be reached by going there.
 */
export function beginSignOut(): void {
  client?.beginSignOut()
}

export const { clearSession, stashShellReason, takeShellReason } = client ?? {
  clearSession: () => {},
  stashShellReason: () => {},
  takeShellReason: () => null,
}

/**
 * The `?code=…` / `?error=…` this load came back with, if any.
 *
 * Read before anything clears it, because the boot decision needs to know
 * whether this page load is a return trip.
 */
export function callbackParams(): { code?: string; error?: string } | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code') ?? undefined
  const error = params.get('error') ?? undefined
  return code || error ? { code, error } : null
}

/** Redeem the code. Throws `SignInError` with something a person can read. */
export async function completeSignIn(): Promise<{ token: StoredToken; returnTo: string }> {
  if (!client) throw new Error('this build offers no sign-in')
  return client.completeSignIn(window.location.search)
}

/** Drop `?code=…` without reloading or touching the hash route. */
export function clearQuery(): void {
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
}

/**
 * Put the person back on the route they opened, before the router reads it.
 *
 * Applied with `replaceState` rather than by assigning `location.hash`, so it
 * leaves no extra history entry and does not reload.
 */
export function restoreRoute(returnTo: string): void {
  if (!returnTo.startsWith('#')) return
  if (window.location.hash) return
  window.history.replaceState({}, '', `${window.location.pathname}${returnTo}`)
}

/** The guard, exposed for the boot decision. Per-tab, like the rest of an attempt. */
export function guardAttemptedAt(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem('estiva.authShell.silentAttempt')
  if (!raw) return null
  const at = Number(raw)
  return Number.isFinite(at) ? at : null
}
