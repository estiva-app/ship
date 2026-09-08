import { Relay, type FetchLike } from '@estiva-app/protocol'
import { isRateLimited, noteRateLimited } from '@/lib/relayBudget'
import { estivaIdSigner, localSigner, type Signer } from '../../../lib/nostr/signer'
import { Store } from '../../../src/store'
import { ID_CONFIG, RELAY_URL } from '../config'
import { currentToken, heldBearer, renew } from '../auth/estivaId'

/**
 * Who signs, decided once.
 *
 * Signed in through Estiva ID: that identity holds the key and this process
 * never sees one. Otherwise: a throwaway per-browser key, exactly as before —
 * the relay wants a signature on every request even to read, and an anonymous
 * reader is a real mode, not a degraded one.
 *
 * **`Store` cannot tell the difference**, which is the point of the signer seam
 * (PEEK-44) and was the claim REW-1 left here to be cashed in REW-2. Nothing
 * below this line changed to support sign-in.
 *
 * ## Decided at module scope, which is why boot order matters
 *
 * The answer is knowable at load time, and threading it through React would make
 * every consumer aware of auth. The cost is that the session must already be
 * settled when this module first evaluates — so `main.tsx` awaits the boot
 * decision and imports `App` dynamically afterwards. See `auth/boot.ts`.
 *
 * Module-private on purpose: the rest of the seam reads and writes through
 * `store`; nothing outside `api/` sees a signer or a relay.
 */
const token = currentToken()

export const signer: Signer =
  ID_CONFIG && token
    ? estivaIdSigner({
        base: ID_CONFIG.base,
        pubkey: token.pubkey,
        // A READER, not the token itself. This signer is built once, here, and
        // lives as long as the page — so a captured string would go stale the
        // moment `startRenewal` replaced it, and the retry below would spend a
        // second grant to reach a token already in storage (identity 0.2.2).
        token: heldBearer,
        // Still here, and still the safety net: a renewal can be late in a
        // background tab, where timers are throttled. Then a 401 from `/sign`
        // becomes an invisible retry rather than an error the person sees.
        renew,
      })
    : localSigner('ship.secretkey')

/**
 * The relay, named so `foreign.ts` can query it (PRO-7).
 *
 * `Store` holds its own reference privately and offers Ship-shaped reads. The
 * projection runtime needs something lower: an arbitrary filter query, because
 * it is resolving another app's objects and Ship's methods only know Ship's.
 *
 * Still inside `api/`, so the rule above holds — nothing *outside* the seam
 * sees a relay or a signer.
 */
/**
 * Every relay response passes through here so a quota refusal is *seen* (SHI-12).
 *
 * The three pollers each swallow their own read errors — none of them wants a
 * failed poll to blank the screen — so none of them can notice that the tab as
 * a whole is over budget. The transport sees every 429, and is the one place
 * that does.
 *
 * The body is read once and handed on, because `FetchLike` promises a `text()`
 * the caller will await and a stream can only be consumed once.
 */
const fetchReportingQuota: FetchLike = async (url, init) => {
  const response = await fetch(url, init)
  const body = await response.text()
  if (response.status === 429 || (response.status >= 400 && isRateLimited(body))) {
    noteRateLimited(body)
  }
  return { status: response.status, text: async () => body }
}

export const relay = new Relay(RELAY_URL, signer, { fetch: fetchReportingQuota })

export const store = new Store(relay, signer)
