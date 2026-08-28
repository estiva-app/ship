import { Relay } from '@estiva-app/protocol'
import { estivaIdSigner, localSigner, type Signer } from '../../../lib/nostr/signer'
import { Store } from '../../../src/store'
import { ID_CONFIG, RELAY_URL } from '../config'
import { currentToken, renew } from '../auth/estivaId'

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
        token: token.accessToken,
        // A 401 from `/sign` becomes an invisible retry rather than an error the
        // person sees. Access tokens are short, so any session of real length
        // crosses an expiry.
        renew,
      })
    : localSigner('ship.secretkey')

export const store = new Store(new Relay(RELAY_URL, signer), signer)
