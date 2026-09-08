/**
 * Ship's live socket (PER-3). One connection, one subscription, every Folder.
 *
 * Ship polled and Peek subscribed, and that was the largest of the three
 * structural differences between them. This closes it, using the plumbing
 * `@estiva-app/platform` holds — so Ship is the second consumer of an API that
 * had only ever had one, which is the whole of SHA-7.
 *
 * ## Why one subscription rather than one per Folder
 *
 * `REQ` is a client→server frame and is metered on the relay's
 * `LimitType::WsEvents`. Measured against production (LIV-1): **50 unpaced REQs
 * are accepted and the 51st is refused** `rate-limited: quota exceeded`. A
 * subscription per Folder would spend one frame each on every connect *and
 * every reconnect* — 34 today, sixteen short of the ceiling, and a workspace
 * that grows past fifty would silently stop subscribing to the remainder.
 *
 * One filter carrying every Folder's `#h` spends one frame, and was measured
 * delivering 34 of 34 live. `watchFolders` chunks at 128, which is the relay's
 * own `MAX_EXPLICIT_CHANNEL_VALUES`.
 *
 * **It is also a property of the deployed relay branch, and the failure is
 * silent.** On a `main`-descended Buzz the same filter registers as a global
 * subscription that `fan_out_scoped` never consults for an event carrying an
 * `h`: 0 of 34 delivered, no error, socket reporting `live`. Production runs
 * `nfb-demo-kinds`, which is why this works. The poll below is what makes that
 * survivable rather than fatal — see `useLiveWorkspace`.
 *
 * ## Why a pushed event triggers a re-read instead of being merged
 *
 * Ship's fold is rebuilt wholesale from a complete read, and it is correct
 * *because* it sees everything at once. Merging a pushed event in would turn a
 * stateless client into one with a cache, and lose deletions and re-links: an
 * incremental reader never re-asks for an event that stopped coming back.
 *
 * Since PER-1 a full re-read is 3 requests and ~577 ms, which is what makes the
 * cheap answer affordable where it was not before. This is also the answer to
 * PER-2, and it is recorded there rather than built.
 */
import { useEffect, useRef, useState } from 'react'
import { signViaEstivaId } from '@estiva-app/identity'
import {
  browserOnlineSource,
  createLiveClientHolder,
  type LiveClient,
} from '@estiva-app/platform'
import type { RelayState } from '@estiva-app/protocol'
import { ID_CONFIG, RELAY_URL } from '../config'
import { currentToken } from '../auth/estivaId'

/**
 * The tab's one binding.
 *
 * `@estiva-app/platform` hands out a holder and keeps nothing, so this line is
 * where "one connection per tab" actually lives. It matters more than it looks:
 * the relay authenticates a connection once and `max_subscriptions` is per
 * connection, so a socket per component mount is wrong rather than wasteful —
 * and React StrictMode builds anything owned by an effect twice.
 */
const holder = createLiveClientHolder()

/**
 * The kinds Ship's workspace is made of.
 *
 * Explicit rather than kindless, and not by taste: a kindless wide filter was
 * refused outright on one relay build with `restricted: p-gated events require
 * #p matching your pubkey` (LIV-1). Naming them also means an unrelated kind
 * landing in a shared Folder — a Peek message, somebody else's app — does not
 * wake a full workspace re-read.
 */
const WORKSPACE_KINDS = [
  30850, // Project
  30851, // Issue
  1851, // Change
  9, // Message
  1111, // Comment (NIP-22)
  5, // Deletion
  40003, // Edit
]

/** How long to wait for a burst to settle before re-reading. */
const DEBOUNCE_MS = 400

/**
 * The client, or `null` when this build cannot authenticate.
 *
 * A relay `REQ` before auth is refused outright, so an anonymous build has
 * nothing to gain from a socket — it would connect, fail to authenticate, and
 * retry. Returning `null` keeps the poll as the only mechanism, which is
 * exactly right there.
 */
function liveClient(): LiveClient | null {
  const base = ID_CONFIG?.base
  if (!base) return null
  return holder.get({
    relayUrl: RELAY_URL,
    // Read fresh on every connect attempt. A token captured once survives a
    // silent renewal as a dead credential, and the reconnect after a renewal
    // would then sign its 22242 with the expired one.
    getCredential: () => {
      const token = currentToken()
      if (!token) return null
      return { accessToken: token.accessToken, pubkey: token.pubkey }
    },
    // `createLiveRelay` passes `(unsigned, token, expectedPubkey)`;
    // `signViaEstivaId` takes an options object. `expectedPubkey` is a *check*,
    // not a request — `/sign` signs as the token's subject whatever it is
    // handed, so a mismatch arrives as HTTP 200 authored by somebody else.
    sign: (unsigned, token, expectedPubkey) =>
      signViaEstivaId(unsigned, { base, token, expectedPubkey }),
    online: typeof window === 'undefined' ? undefined : browserOnlineSource(window),
    subscriptionPrefix: 'ship-',
    log: (message, detail) => console.debug('[relay]', message, detail ?? ''),
  })
}

export interface LiveWorkspace {
  /** `'off'` when this build cannot authenticate and there is no socket at all. */
  relayState: RelayState | 'off'
  /** True while the socket is delivering, which is when the poll stands down. */
  live: boolean
}

/**
 * Subscribe to every Folder in `folders`, and call `onChange` when one changes.
 *
 * `folders` comes from the last read, because discovery *derives* it — so the
 * first subscription can only open after a read has landed, and the set is
 * re-subscribed when it changes. Compared by value: an unchanged tick must not
 * tear down and rebuild 34 subscriptions, and a re-linked project must.
 */
export function useLiveWorkspace(folders: string[], onChange: () => void): LiveWorkspace {
  const [relayState, setRelayState] = useState<RelayState | 'off'>('off')
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  }, [onChange])

  // The identity of the array changes on every read; its contents rarely do.
  const key = [...folders].sort().join(',')

  useEffect(() => {
    const client = liveClient()
    if (!client) {
      setRelayState('off')
      return
    }
    setRelayState(client.state())
    const releaseState = client.onState(setRelayState)
    if (!key) return releaseState

    let timer: ReturnType<typeof setTimeout> | undefined
    const watch = client.watchFolders(
      key.split(','),
      () => {
        // Debounced: one gesture in another app can be several events — a
        // status change is a `kind:1851` and a comment is a `kind:1111`, and a
        // re-link is both — and each would otherwise be its own full re-read.
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => latest.current(), DEBOUNCE_MS)
      },
      { kinds: WORKSPACE_KINDS },
    )

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      watch.stop()
      releaseState()
    }
  }, [key])

  return { relayState, live: relayState === 'live' }
}
