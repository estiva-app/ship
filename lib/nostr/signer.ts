/**
 * Who signs, decided once and injected everywhere (PEEK-44).
 *
 * ## Why this exists at all
 *
 * The README claims two apps built by different people, sharing no code and no
 * database, can work on the same data. Wiring Ship directly to our own login
 * service would quietly undercut that — the app would only work for people with
 * an Estiva account.
 *
 * Depending on a *signer* does not. Separating the signer from the client is
 * ordinary Nostr architecture (NIP-07, NIP-46), so the app stays honest for
 * anyone who wants to point their own signer at it, and "sign in with Estiva ID"
 * becomes one implementation among several rather than an assumption baked into
 * the data layer.
 *
 * ## The two decisions in the interface
 *
 * **`pubkey` is synchronous.** Every event builder needs it before there is
 * anything to sign — `buildIssue(pubkey, …)` — so making it a promise would put
 * an `await` in front of every construction site for no benefit. You know who
 * you are before you sign; implementations that must ask (NIP-07) resolve it
 * once, at construction.
 *
 * **`sign` is asynchronous**, because two of the three implementations are: a
 * remote call to `/sign` and a round trip to a browser extension. The local key
 * is the odd one out, and it is cheaper for it to return a resolved promise than
 * for the interface to pretend signing is always instant.
 *
 * ## What a signer deliberately cannot do
 *
 * Sign as somebody else. Every implementation attributes the event to its own
 * `pubkey` and ignores whatever the caller put there, which is the same
 * guarantee `/sign` makes server-side. Code that genuinely needs to produce a
 * mismatched event — `scripts/verify.ts` forging one to prove the relay rejects
 * it — uses `signEvent` directly and holds a raw key to do it.
 */
import type { SignedEvent, UnsignedEvent } from './events'
import { publicKeyFromSecret, signEvent } from './sign'

/** How the current signer authenticates, for anything that needs to say so. */
export type SignerKind = 'local' | 'estiva-id' | 'nip07'

export interface Signer {
  /** The pubkey every event from this signer is attributed to. */
  readonly pubkey: string
  readonly kind: SignerKind
  /** Attributes the event to {@link pubkey}, whatever the caller supplied. */
  sign(unsigned: UnsignedEvent): Promise<SignedEvent>
}

/**
 * A signer holding a raw secret key.
 *
 * The honest name for what the app has always done. Used directly by scripts,
 * which have no `localStorage`, and underneath {@link localSigner}.
 */
export function secretKeySigner(secretKeyHex: string, kind: SignerKind = 'local'): Signer {
  const pubkey = publicKeyFromSecret(secretKeyHex)
  return {
    pubkey,
    kind,
    async sign(unsigned) {
      return signEvent({ ...unsigned, pubkey }, secretKeyHex)
    },
  }
}

/**
 * A per-browser identity, generated on first use and kept in `localStorage`.
 *
 * This is the anonymous path, and it stays. An independent client with no
 * account can still participate in the shared record — which is a large part of
 * what the demo is for, and the reason signing out has to leave a working app
 * rather than an error (PEEK-47).
 *
 * Keys are throwaway: these apps are props, not products.
 */
export function localSigner(storageKey: string): Signer {
  let secretKeyHex = localStorage.getItem(storageKey)
  if (!secretKeyHex) {
    secretKeyHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    localStorage.setItem(storageKey, secretKeyHex)
  }
  return secretKeySigner(secretKeyHex, 'local')
}

export interface EstivaIdSignerOptions {
  /** Origin of the identity service, e.g. `https://id.estiva.app`. */
  base: string
  /** The pubkey the token was issued for — `sub` in the JWT. */
  pubkey: string
  /** A bearer token from `POST /token`, audience-bound to this app. */
  token: string
  /**
   * Renew the token, once, when `/sign` says it has expired (PEEK-108).
   *
   * Optional: without it the signer behaves exactly as before and a `401`
   * surfaces as `SignerTokenExpired` for the caller to deal with. With it, an
   * expiry is invisible — which matters much more now that access tokens live
   * ten minutes rather than an hour, so a session of any length crosses one.
   *
   * Returning `null` means renewal failed and the expiry is real.
   */
  renew?: () => Promise<string | null>
}

/**
 * Signing by asking the identity service, holding no key at all.
 *
 * The point of the seam: this app can publish as a person without ever seeing
 * their secret. Obtaining the token is not this module's job — that is the
 * sign-in flow (PEEK-47) — so it arrives as a parameter.
 *
 * **`/sign` refuses `kind:0` for every app, always.** Profiles belong to the
 * identity service, which is the whole of PEEK-31; a refusal here is the policy
 * working, not a bug to route around.
 *
 * Tokens are short-lived. A `401` means the token expired and the caller should
 * obtain a new one rather than treat it as a signing failure — hence the
 * distinct error.
 */
export function estivaIdSigner({ base, pubkey, token, renew }: EstivaIdSignerOptions): Signer {
  const origin = base.replace(/\/+$/, '')
  // The live token. Reassigned by a renewal so later signatures use the new one
  // rather than retrying the expired one every time.
  let bearer = token

  return {
    pubkey,
    kind: 'estiva-id',
    async sign(unsigned) {
      const post = (auth: string) =>
        fetch(`${origin}/sign`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${auth}`,
          },
          body: JSON.stringify({
            event: {
              kind: unsigned.kind,
              created_at: unsigned.created_at,
              tags: unsigned.tags,
              content: unsigned.content,
            },
          }),
        })

      let response = await post(bearer)

      /**
       * Renew once and retry, never twice.
       *
       * A second `401` after a successful renewal is not an expiry — it is a
       * token the service will not accept, and retrying that in a loop is how
       * one refused signature becomes a hot loop against the identity service.
       */
      if (response.status === 401 && renew) {
        const renewed = await renew()
        if (renewed) {
          bearer = renewed
          response = await post(bearer)
        }
      }

      const text = await response.text()
      if (response.status === 401) throw new SignerTokenExpired()
      if (!response.ok) {
        let reason = text.slice(0, 200)
        try {
          const body = JSON.parse(text) as { error?: { message?: string } }
          reason = body.error?.message ?? reason
        } catch {
          // keep the raw text
        }
        throw new Error(`Estiva ID refused to sign kind:${unsigned.kind} — ${reason}`)
      }
      return (JSON.parse(text) as { event: SignedEvent }).event
    },
  }
}

/** Distinguishes "sign in again" from "this event was refused". */
export class SignerTokenExpired extends Error {
  constructor() {
    super('The signing token has expired')
    this.name = 'SignerTokenExpired'
  }
}

/** The subset of NIP-07 this needs. Declared locally — no extension types installed. */
interface Nip07 {
  getPublicKey(): Promise<string>
  signEvent(event: UnsignedEvent): Promise<SignedEvent>
}

/**
 * A browser extension holding the key (NIP-07).
 *
 * Async to construct, because the pubkey has to be asked for once before the
 * interface can promise it synchronously — and asking is what triggers the
 * extension's permission prompt, which is better at sign-in than midway through
 * publishing an issue.
 *
 * Nothing in the app requires this to exist; it is here because the interface
 * costs nothing extra to satisfy and its absence would be the thing that made
 * the seam look like a formality.
 */
export async function nip07Signer(): Promise<Signer> {
  const nostr = (globalThis as { nostr?: Nip07 }).nostr
  if (!nostr) throw new Error('No NIP-07 extension found')

  const pubkey = await nostr.getPublicKey()
  return {
    pubkey,
    kind: 'nip07',
    async sign(unsigned) {
      return nostr.signEvent({ ...unsigned, pubkey })
    },
  }
}
