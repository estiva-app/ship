import { MERGE_READS_MS, type FetchLike, type RelayFileReads } from '@estiva-app/protocol'
import type { TimesFn } from '@estiva-app/interop'
import { isRateLimited, noteRateLimited } from '@/lib/relayBudget'
import { estivaIdSigner, localSigner, type Signer } from '../nostr/signer'
import { Store } from '../nostr/store'
import { ListReadRelay } from '../nostr/listReadRelay'
import { readFileReads } from './fileReads'
import { ID_CONFIG, RELAY_URL } from '../config'
import { relayClockSkew } from './clock'
import { heldBearer, heldToken, renew } from '../auth/estivaId'
import { heardRefusal } from '../lib/failureReports'
import { heardFromRelay, hearingSigner } from '../lib/heardFailures'
import { answerWithin } from './answerWithin'

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
// The held session, not `currentToken()`: a boot that stopped waiting on a slow renewal enters on an expired token
// (AUT-4), and the page is still that person's. Choosing on a valid token would sign as the device key for the rest
// of the page.
const token = heldToken()

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
  let response: { status: number; body: string }
  try {
    // A read the relay goes silent on ends here, instead of loading for good (SHI-68).
    response = await answerWithin(url, init)
  } catch (error) {
    // Never answered: offline, cut, timed out, or the page leaving. Said for the failure a screen draws next (34396209).
    heardFromRelay(error)
    throw error
  }
  const { body } = response
  if (response.status === 429 || (response.status >= 400 && isRateLimited(body))) {
    noteRateLimited(body)
  }
  // Why a read failed, for the report of the failure it becomes: the relay's status and prefix, never its sentence.
  if (response.status >= 400) heardFromRelay(body, response.status)
  return { status: response.status, text: async () => body }
}

// Every refused write is reported by its reason code, busy answers included (PROD-5).
// A list read in one request, never paged (ISS-9).
// Plain reads asked together go out as one request: an open spent 74–99 of a person's 300 a minute (SHI-61).
export const relay = new ListReadRelay(RELAY_URL, hearingSigner(signer), { fetch: fetchReportingQuota, onRefused: heardRefusal, mergeReadsMs: MERGE_READS_MS })

/** The relay's NIP-11, asked once, on the first read that needs it: which types it searches by their current words. */
let fileReads: Promise<RelayFileReads> | undefined
const fileReadsNow = (): Promise<RelayFileReads> => (fileReads ??= readFileReads(() => relay.info()))

/** The types the relay finds by the words of their current fields (`file_search.types`, ALO-6). */
export const searchedTypes = async (): Promise<readonly string[]> => (await fileReadsNow()).search

/**
 * The relay's times read (SPEC §6.13): when each file and its changes were written, never the changes.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-relay-may-answer-when-a-file-changed-without-the-change.md
 */
export const times: TimesFn = (filters) => relay.queryTimes(filters as never)

export const store = new Store(relay, signer, relayClockSkew)
