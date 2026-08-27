/**
 * The signer implementations this app has, over `@estiva-app/protocol`'s seam.
 *
 * The {@link Signer} interface, and the raw-secret-key implementation of it,
 * moved into the package in SHA-3 — they are part of how an event gets its
 * signature, which is the one thing the suite may not disagree with itself
 * about. The interface's own reasoning (why `pubkey` is synchronous and `sign`
 * is not, and why a signer cannot sign as somebody else) travelled with it and
 * lives in `@estiva-app/protocol`'s `sign.ts`.
 *
 * What stays here is everything that knows about **Estiva ID**: the token, the
 * renewal, the `/sign` round trip, and the browser-extension path. That is
 * identity rather than protocol, and it is `@estiva-app/identity`'s remit —
 * SHA-4, which lands inside REW-2. Until then this file is the app's copy, and
 * it is still byte-identical to Ship's, which `diff -r lib/nostr` continues to
 * hold.
 *
 * The re-exports below are not a shim. `Signer` is the interface these functions
 * implement, and a module that implements an interface may reasonably hand it on
 * to its callers — that is what keeps every existing `from './signer'` import in
 * this repo pointing at one definition of the bytes rather than two.
 */
import type { SignedEvent, UnsignedEvent } from '@estiva-app/protocol'
import { secretKeySigner, type Signer, type SignerKind } from '@estiva-app/protocol'

export type { Signer, SignerKind }
export { secretKeySigner }

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
