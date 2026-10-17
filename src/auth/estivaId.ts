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
 * ## The redirect URI is FIXED, and the route travels in `returnTo`
 *
 * This file was written in REW-2, when Ship routed on `location.hash`. REW-3/4/5
 * moved `web/` to real paths — `App.tsx` reads `location.pathname` — and this
 * file was never told. Three things followed from the stale premise, and the
 * first one locked people out of production:
 *
 * 1. `redirectUri()` returned the **current pathname**. Harmless when every
 *    route was a fragment and the path was always `/`; once routes became paths
 *    it produced one URI per page. Estiva ID compares `redirect_uri`
 *    **exact-string** against a registered list, so a token expiring on
 *    `/project/<slug>` sent the person to `/authorize` with an unregistered URI
 *    and got `400 bad_request: That redirect_uri is not registered for this
 *    app` — a JSON error page on the identity origin, with no way back into the
 *    app.
 * 2. `returnTo` was `location.hash || '#/'`, which under path routing is always
 *    `'#/'`. The route was never carried.
 * 3. `restoreRoute` began `if (!returnTo.startsWith('#')) return`, so it could
 *    never restore a path even if one had been carried.
 *
 * **One URI is registered, measured rather than assumed** (2026-09-08, against
 * production `id.estiva.app`, `prompt=none` probes):
 *
 * | `redirect_uri` | answer |
 * | --- | --- |
 * | `https://ship.estiva.app/` | 302 — registered |
 * | `https://ship.estiva.app` | 400 |
 * | `https://ship.estiva.app/auth/callback` | 400 |
 * | `https://ship.estiva.app/projects` | 400 |
 *
 * So the fixed URI is the origin **with its trailing slash** — the slash is not
 * cosmetic, its absence is a refused sign-in. Peek's equivalent is a dedicated
 * `/auth/callback`; Ship cannot use one without an Estiva ID seed change and a
 * re-seed, and does not need to: `bootAuth` redeems the code from
 * `location.search` on whatever page it lands on, so the root works and this
 * fix ships without touching the identity service.
 */
import { createEstivaId, type Renewal, type ShellReason, type StoredToken } from '@estiva-app/identity'
import { ID_CONFIG } from '../config'
import { forgetHeldTyping, holdTyping, holdTypingFor } from './heldTyping'

/** Where the package keeps the session: `<keyPrefix>.token`, in `localStorage`, shared by every tab. */
const KEY_PREFIX = 'ship.estiva-id'
const TOKEN_KEY = `${KEY_PREFIX}.token`
/** When a tab last signed out, so another tab can tell a sign-out from a refused renewal: both clear the token. */
const SIGNED_OUT_KEY = `${KEY_PREFIX}.signed-out`

function signedOutJustNow(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SIGNED_OUT_KEY) ?? 0) < 10_000
  } catch {
    return false
  }
}

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
      // Fixed, and the trailing slash is load-bearing — see the table above.
      // Never the current path: that is one URI per page against an exact-string
      // registered list, which is the lockout this file's header describes.
      redirectUri: () => `${window.location.origin}/`,
      storage: () => (typeof localStorage === 'undefined' ? null : localStorage),
      pendingStore: () => (typeof sessionStorage === 'undefined' ? null : sessionStorage),
      keyPrefix: KEY_PREFIX,
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

/**
 * The bearer the signer should present, read per signature.
 *
 * **Deliberately `storedToken` rather than {@link currentToken}.** That one
 * subtracts a minute of write-time slack, and a reader is not the place for it:
 * between `expiresAt - 60s` and the moment the schedule fires there would be no
 * bearer at all, and `estivaIdSigner` treats an absent one as an expiry without
 * attempting a renewal. Writes would fail in a window where they used to work.
 *
 * Judging a token is `/sign`'s job — it holds the key. This answers the narrower
 * question the signer actually asks: what is the newest bearer we hold. So
 * `undefined` means **signed out**, which is the one case worth refusing without
 * a round trip.
 *
 * Passing a reader rather than a string is what makes {@link startRenewal}
 * worth having: a signer holding a captured string would keep presenting the old
 * token after a scheduled renewal, pay a 401, and spend a second grant to reach
 * the token the app already had (identity 0.2.2).
 */
export function heldBearer(): string | undefined {
  return client?.storedToken()?.accessToken
}

/**
 * The session this page holds, expired or not: whose page it is.
 *
 * Not {@link currentToken}: since AUT-4 the boot can enter on an expired token
 * when Estiva ID is slow to renew it, and the page still belongs to that person
 * while the renewal finishes.
 */
export function heldToken(): StoredToken | null {
  return client?.storedToken() ?? null
}

/**
 * Renew before the token expires, rather than when a write discovers it has.
 *
 * Ship has renewed on a 401 from `/sign` since REW-2, which works and is not
 * the same thing: the person's next action is what pays for the expiry. The
 * package has offered this since 0.1.2 and no consumer had taken it.
 *
 * **A refusal asks for the passkey on the page (AUT-4).** Until then a refused
 * renewal only logged, and Ship went on drawing the person's avatar over a
 * session that had ended: Katerina's "not signed in" banner with only Sign out
 * in the menu (18 Aug). Now it ends the session in {@link sessionEnded}, and
 * `SessionGate` draws the shared passkey screen in place of the page, which Continue
 * comes back to (SPEC §4.4).
 *
 * Since identity 0.3.0 the schedule also renews when the tab is shown again and
 * when the network comes back, under a Web Lock, so two tabs spend one refresh
 * token rather than replaying it; an unreachable Estiva ID is retried, never an
 * ending.
 */
let schedule: { cancel: () => void } | null = null

export function startRenewal(): { cancel: () => void } | null {
  /*
    Idempotent, because two schedules would each renew and a refresh token is
    single-use — the package coalesces concurrent renewals, but two timers
    firing a minute apart are not concurrent, and the second would spend a grant
    for a token it had just been given. `bootAuth` is called once in the app and
    once per test, so this is cheap insurance rather than a hypothetical.
  */
  schedule?.cancel()
  schedule =
    client?.scheduleRenewal({
      onEnded: () => endSession('session_expired'),
    }) ?? null
  return schedule
}

/**
 * Whether this page's sign-in has ended, and why: the one thing the page
 * subscribes to, so a renewal refused here or a sign-out in another tab draws
 * the shell over whatever is on screen.
 */
let ended: ShellReason | null = null
const endedListeners = new Set<() => void>()

function endSession(reason: ShellReason): void {
  if (ended) return
  // Before the screen takes the page's place, while what was typed is still there to read; not for a sign-out.
  if (reason === 'session_expired') holdTyping()
  ended = reason
  schedule?.cancel()
  for (const listener of endedListeners) listener()
}

export function sessionEnded(): ShellReason | null {
  return ended
}

export function subscribeSessionEnded(listener: () => void): () => void {
  endedListeners.add(listener)
  return () => endedListeners.delete(listener)
}

/**
 * Follow the other tabs (PEE-3, as Peek's `useEstivaIdAuth`). They share the
 * session in `localStorage`:
 *
 * - **another tab renewed:** nothing to do. The package's schedule reads the
 *   stored expiry when it next fires, and the signer reads {@link heldBearer}
 *   per signature, so this tab already presents the new token;
 * - **another tab signed out, or its renewal was refused:** the token is gone.
 *   This tab draws the plain sign-in screen at once, not at its next write;
 * - **somebody else signed in, or a session came back after this page lost
 *   it:** reload. The store under this page holds what the last person read,
 *   and its signer and socket were built for them.
 */
export function followOtherTabs(): () => void {
  if (!client || typeof window === 'undefined') return () => {}
  const person = client.storedToken()?.pubkey
  holdTypingFor(person)
  const follow = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage || (event.key !== TOKEN_KEY && event.key !== null)) return
    const token = client.storedToken()
    // Gone because that tab signed out, or because its renewal was refused: the second is this sign-in ending too,
    // and what was typed here is held for it.
    if (token === null) endSession(event.key === null || signedOutJustNow() ? 'no_session' : 'session_expired')
    else if (ended || token.pubkey !== person) window.location.reload()
  }
  window.addEventListener('storage', follow)
  return () => window.removeEventListener('storage', follow)
}

/**
 * Whether an expired access token can be renewed here without leaving the page:
 * the package's `canRenew` for `decideBoot`.
 */
export function canRenew(): boolean {
  return client?.storedToken()?.refreshToken !== undefined
}

/** Spend the stored refresh token once, for the boot's `renew` step. */
export async function renewInPlace(): Promise<Renewal> {
  if (!client) return { outcome: 'none' }
  const renewal = await client.renew()
  // Also when the boot stopped waiting and entered: nothing is armed yet to hear
  // this refusal, and the session it ended is already cleared.
  if (renewal.outcome === 'refused') endSession('session_expired')
  return renewal
}

/**
 * For `estivaIdSigner`'s `renew`, so a 401 from `/sign` is an invisible retry.
 *
 * `client.renew` is what `refreshAccessToken` wraps, coalesced the same way; it
 * is used here for its `refused`, which ends the sign-in on this page too. The
 * package clears the store, and that tells only the *other* tabs.
 */
export async function renew(): Promise<string | null> {
  if (!client) return null
  const renewal = await client.renew()
  if (renewal.outcome === 'refused') endSession('session_expired')
  return renewal.outcome === 'renewed' ? renewal.token.accessToken : null
}

/**
 * Send the person to Estiva ID, carrying the current route in `returnTo`.
 *
 * The route is a **path** now. It was `location.hash || '#/'` until this fix,
 * which under path routing meant every sign-in carried the string `'#/'` and
 * came back to the root, however deep a link somebody had opened (PEEK-123 is
 * the ticket about not doing that).
 */
export async function beginSignIn(options: { silent?: boolean } = {}): Promise<void> {
  // The hash too: a block link (RIC-18) is the page plus `#block-<id>`, and signing in must land on that block.
  await client?.beginSignIn(`${window.location.pathname}${window.location.search}${window.location.hash}`, options)
}

/**
 * Leave for Estiva ID to end the session *there* (PEEK-122).
 *
 * Clearing the local token is not signing out: the `estiva_id_session` cookie on
 * the identity origin survives it, so the next silent probe succeeds and puts the
 * person straight back in. The cookie can only be reached by going there.
 */
export function beginSignOut(): void {
  forgetHeldTyping()
  // Before the token goes, so the other tabs read its removal as a sign-out and hold nothing.
  try {
    localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()))
  } catch {
    // Blocked storage: the other tabs hear nothing either.
  }
  client?.beginSignOut()
}

export const { clearSession, stashShellReason, takeShellReason, takeReturnTo } = client ?? {
  clearSession: () => {},
  stashShellReason: () => {},
  takeShellReason: () => null,
  takeReturnTo: () => null,
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

/** Drop `?code=…` without reloading or losing the path. */
export function clearQuery(): void {
  window.history.replaceState({}, '', window.location.pathname)
}

/**
 * Put the person back on the route they opened, before the router reads it.
 *
 * Applied with `replaceState` rather than by assigning `location.href`, so it
 * leaves no extra history entry and does not reload.
 */
export function restoreRoute(returnTo: string): void {
  /*
    A path on this origin and nothing else. `returnTo` is read back from storage
    this tab wrote, which is not the same as trusting it: a value beginning `//`
    is a protocol-relative URL and `replaceState` would accept it, turning a
    stored string into somewhere else entirely.
  */
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return
  // Something already put us on a route; do not overwrite it. The callback
  // always lands on `/`, because that is the only registered redirect URI.
  if (window.location.pathname !== '/') return
  window.history.replaceState({}, '', returnTo)
}

/** The guard, exposed for the boot decision. Per-tab, like the rest of an attempt. */
export function guardAttemptedAt(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem('estiva.authShell.silentAttempt')
  if (!raw) return null
  const at = Number(raw)
  return Number.isFinite(at) ? at : null
}
