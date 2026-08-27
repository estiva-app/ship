import { Relay } from '@estiva-app/protocol'
import { localSigner, type Signer } from '../../../lib/nostr/signer'
import { Store } from '../../../src/store'
import { RELAY_URL } from '../config'

/**
 * Who signs, decided once.
 *
 * Anonymous: a throwaway per-browser key, exactly as the old app does when
 * nobody is signed in — the relay wants a signature on every request even to
 * read, and an anonymous reader is a real mode, not a degraded one. Sign-in
 * through Estiva ID replaces this signer in REW-2; `Store` cannot tell the
 * difference, which is the point of the signer seam.
 *
 * Module-private on purpose: the rest of the seam reads and writes through
 * `store`; nothing outside `api/` sees a signer or a relay.
 */
export const signer: Signer = localSigner('ship.secretkey')

export const store = new Store(new Relay(RELAY_URL, signer), signer)
