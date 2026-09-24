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
import { estivaIdSigner, SignerTokenExpired, type EstivaIdSignerOptions } from '@estiva-app/identity'

export type { Signer, SignerKind }
export { secretKeySigner }

/**
 * The Estiva ID signer, from `@estiva-app/identity` since SHA-4.
 *
 * Re-exported rather than re-implemented, and re-exported rather than having
 * every call site re-pointed: `from './signer'` is what this repo already says
 * everywhere, and one definition of the bytes is what that was always for.
 *
 * **It now checks the author, which this copy never did.** `/sign` signs as the
 * token's subject whatever it is handed, so a mismatch comes back as HTTP 200
 * carrying a valid event by somebody else. `expectedPubkey` is supplied from the
 * pubkey the signer was built with, unconditionally. Here that is
 * `clientCredentialsToken`'s own answer, so it agrees by construction — and if a
 * renewal ever returned a different identity it would now fail loudly instead of
 * publishing under it.
 */
export { estivaIdSigner, SignerTokenExpired }
export type { EstivaIdSignerOptions }

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
