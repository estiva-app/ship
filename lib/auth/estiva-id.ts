/**
 * Ship's Estiva ID client: the package, bound to Ship's choices.
 *
 * The PKCE flow, token storage, silent renewal and sign-out moved into
 * `@estiva-app/identity` with SHA-4, and `shell/contract.ts` went with them —
 * that file was byte-identical to Peek's apart from a comment saying so.
 *
 * What is left here is configuration and a thin adapter. Ship's own vocabulary
 * (`EstivaIdSession.token`, `SignInOutcome`) is kept rather than renamed through
 * the app, because REW-9 deletes this app and renaming a codebase on death row
 * buys nothing. `web/` will consume the package directly.
 *
 * ## Ship needs TWO stores, and that is what wiring it found
 *
 * The session lives in `localStorage` so it outlives a tab. The in-flight PKCE
 * credentials — verifier, state, route, and the silent-attempt guard — live in
 * `sessionStorage`, because the flow starts and ends in one tab and a genuinely
 * new tab is entitled to a fresh attempt.
 *
 * The package assumed **one** store until this file was written, because it was
 * extracted from Peek, which uses one. That is the "a library pulled from one app
 * comes out shaped like that app" failure SHA-4 names, and it was found by the
 * mechanism SHA-4 prescribes: wiring the second consumer. `pendingStore` is what
 * came of it.
 *
 * ## Ship needs no data-layer adapter, which is the other thing being proved
 *
 * Peek keeps `useEstivaIdAuth.ts` — a hook shaped to Convex's `useAuth` contract.
 * Ship has no equivalent and needs none: it hands the token to `estivaIdSigner`,
 * which hands it to the relay client. That absence is SHA-4's seam decision
 * holding, and it is the check a grep cannot do.
 */
import {
  type ShellReason,
  createEstivaId,
  reasonForCallbackError,
} from '@estiva-app/identity'

/** Where the token and its metadata live between page loads — and between tabs. */
const SESSION_KEY_PREFIX = 'ship.estiva-id'

export interface EstivaIdSession {
  token: string
  pubkey: string
  /** Epoch ms. Checked before use — a token past this is not offered. */
  expiresAt: number
  /**
   * Renews the access token without a redirect (PEEK-108).
   *
   * Absent against a deployment that issues none, in which case an expiry
   * behaves as it always did. **Single-use** — Estiva ID rotates it on every
   * redemption and reads a replay as theft, so it is replaced, never kept
   * beside its successor.
   */
  refreshToken?: string
}

export interface EstivaIdConfig {
  /** Origin of the identity service, e.g. `https://id.estiva.app`. */
  base: string
  /** This app's `client_id` in `app_credentials`. */
  clientId: string
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
 * Where Estiva ID sends people back to.
 *
 * The app's own origin and path, with no query — it must match a registered
 * `redirect_uri` **exactly**, since an identity provider that prefix-matches is
 * an open redirector handing out authorization codes.
 *
 * Peek's equivalent is a fixed `/auth/callback`. Ship's is the current pathname
 * because it routes on `location.hash`, and a fragment cannot survive the
 * redirect chain — which is why the route is stashed separately below.
 */
export function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/** The hash route to restore afterwards. Per-tab, like the rest of the attempt. */
const ROUTE_KEY = `${SESSION_KEY_PREFIX}.route`

let configured: EstivaIdConfig | null = null

/**
 * Built lazily and once, because `EstivaIdConfig` arrives from the app's own
 * config module and an empty `base` means sign-in is not offered at all — the
 * anonymous-only build is a real mode, not a broken one.
 */
function client(config: EstivaIdConfig) {
  if (!configured || configured.base !== config.base || configured.clientId !== config.clientId) {
    configured = config
    cached = createEstivaId({
      base: config.base,
      clientId: config.clientId,
      redirectUri,
      // The session outlives a tab.
      storage: () => (typeof localStorage === 'undefined' ? null : localStorage),
      // The attempt does not. See the header.
      pendingStore: () => (typeof sessionStorage === 'undefined' ? null : sessionStorage),
      keyPrefix: SESSION_KEY_PREFIX,
      navigate: (url) => window.location.assign(url),
    })
  }
  return cached!
}
let cached: ReturnType<typeof createEstivaId> | null = null

/** The package's `StoredToken` in Ship's vocabulary. Goes away with REW-9. */
const asSession = (t: { accessToken: string; pubkey: string; expiresAt: number; refreshToken?: string }): EstivaIdSession => ({
  token: t.accessToken,
  pubkey: t.pubkey,
  expiresAt: t.expiresAt,
  ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}),
})

/**
 * A stored session, if there is one and it has not expired.
 *
 * A minute of slack, which is Ship's own choice and stricter than the package's
 * 30s: a token that expires mid-request is worse than one refreshed slightly
 * early, and re-running the flow is silent anyway.
 */
export function currentSession(config: EstivaIdConfig): EstivaIdSession | null {
  const t = client(config).validToken(Date.now() + 60_000)
  return t ? asSession(t) : null
}

export function signOut(config: EstivaIdConfig): void {
  client(config).clearSession()
}

/** Send the person to Estiva ID. Navigates away, so nothing after this runs. */
export async function beginSignIn(
  config: EstivaIdConfig,
  { silent = false }: { silent?: boolean } = {},
): Promise<void> {
  // Kept locally for the same reason `state` is not widened into a payload: what
  // comes back from the identity service is compared, never trusted. Ship's route
  // is a fragment, which the package cannot know about — so it is stashed here
  // and `returnTo` carries it.
  if (window.location.hash) sessionStorage.setItem(ROUTE_KEY, window.location.hash)
  await client(config).beginSignIn(window.location.hash || '/', { silent })
}

/**
 * Renew the access token without leaving the page (PEEK-108).
 *
 * Handed to `estivaIdSigner` as its `renew`, so a `401` from `/sign` becomes an
 * invisible retry rather than an error the person sees.
 */
export async function renewAccessToken(config: EstivaIdConfig): Promise<string | null> {
  const next = await client(config).refreshAccessToken()
  return next?.accessToken ?? null
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
 * Clearing the local token is not signing out: the `estiva_id_session` cookie is
 * untouched, so the shell's silent probe succeeds on the next boot and puts the
 * person straight back in. The cookie can only be reached by going there.
 */
export function beginSignOut(config: EstivaIdConfig): void {
  client(config).beginSignOut()
}

/**
 * Finish the round trip, in Ship's outcome vocabulary.
 *
 * The package throws `SignInError`; Ship returns an outcome, because its shell is
 * driven by a returned state rather than by an exception boundary. Mapping the
 * failure to a `ShellReason` uses the package's own `reasonForCallbackError`, so
 * the two apps still agree on what each error means — only the presentation
 * differs, which is exactly the line the package draws.
 */
export async function completeSignIn(config: EstivaIdConfig): Promise<SignInOutcome> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return { kind: 'none' }

  const search = window.location.search
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

  try {
    const { token } = await client(config).completeSignIn(search)
    return { kind: 'signed-in', session: asSession(token) }
  } catch (cause) {
    // Every refusal from `/token` is `invalid_grant` by design — the specific
    // reason is in Estiva ID's audit log, not in this reply. So the message a
    // person sees is deliberately uniform, and the shell reason is what varies.
    return {
      kind: 'failed',
      reason: (cause as Error).message || 'Could not complete sign-in. Try again.',
      shellReason: 'exchange_failed',
    }
  }
}

/** Drop `?code=…` and friends without reloading or touching the hash route. */
function clearQuery(): void {
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
}
