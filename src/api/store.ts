import { ISSUE_TYPE, fileFieldsOf, projectFieldsOf, type FetchLike, type RelayFileReads } from '@estiva-app/protocol'
import type { TimesFn } from '@estiva-app/interop'
import { isRateLimited, noteRateLimited } from '@/lib/relayBudget'
import { estivaIdSigner, localSigner, type Signer } from '../nostr/signer'
import { Store, type ProjectFields } from '../nostr/store'
import { ListReadRelay } from '../nostr/listReadRelay'
import { issueFieldsOptedIn, optedIn, readFileReads } from './fileReads'
import { ID_CONFIG, RELAY_URL } from '../config'
import { relayClockSkew } from './clock'
import { heldBearer, heldToken, renew } from '../auth/estivaId'
import { heardRefusal } from '../lib/failureReports'

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
  const response = await fetch(url, init)
  const body = await response.text()
  if (response.status === 429 || (response.status >= 400 && isRateLimited(body))) {
    noteRateLimited(body)
  }
  return { status: response.status, text: async () => body }
}

// Every refused write is reported by its reason code, busy answers included (PROD-5).
// A list read in one request, never paged (ISS-9).
export const relay = new ListReadRelay(RELAY_URL, signer, { fetch: fetchReportingQuota, onRefused: heardRefusal })

/** The switch (ALO-5): the relay's NIP-11 asked once, on the first read that needs it. */
let fileReads: Promise<RelayFileReads> | undefined
let projectFields: Promise<ProjectFields | undefined> | undefined
const opted = optedIn()
const fileReadsNow = (): Promise<RelayFileReads> => (fileReads ??= readFileReads(() => relay.info()))
export const projectFieldsNow = (): Promise<ProjectFields | undefined> =>
  (projectFields ??= fileReadsNow().then((reads) => projectFieldsOf(reads, opted)))

/**
 * Issues' own switch (ISS-4): on once the relay keeps issues in order, or for a
 * tab opened with `?issueFields=on`, apart from projects'. Read once per page,
 * as the projects' one.
 */
let issueFields: Promise<ProjectFields | undefined> | undefined
const issuesOpted = issueFieldsOptedIn()
export const issueFieldsNow = (): Promise<ProjectFields | undefined> =>
  (issueFields ??= fileReadsNow().then((reads) => fileFieldsOf(reads, ISSUE_TYPE, issuesOpted)))

/**
 * The types the relay keeps in order (NIP-11 `files.requires_prev`), for the
 * shared packages' `inOrder`: a comment, a mention, a card, a listing, a block
 * link or a `[` pick names a file of one by its id as well (ALO-8). Read
 * whether or not this tab opted in, since the relay is what keeps them so —
 * Peek's `inOrderTypes`.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-named-by-its-id-in-a-capital-and-small-tag.md
 */
export const inOrderTypes = (): Promise<readonly string[]> => fileReadsNow().then((reads) => reads.inOrder)

/** `inOrder` as an option: absent while the relay keeps no type in order, so every write is as before. */
export const inOrderOption = async (): Promise<{ inOrder?: readonly string[] }> => {
  const inOrder = await inOrderTypes()
  return inOrder.length > 0 ? { inOrder } : {}
}

/**
 * The relay's times read (NIP-11 `file_list.times`) as interop's `times` option: absent while the relay does not offer it, so a topic's files are read as before.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-relay-may-answer-when-a-file-changed-without-the-change.md
 */
export const timesOption = async (): Promise<{ times?: TimesFn }> =>
  (await fileReadsNow()).times ? { times: (filters) => relay.queryTimes(filters as never) } : {}

/**
 * The relay refused a change for naming no `prev`: it has made the switch
 * since this tab read its NIP-11 (ALO-8). Read it again, so every later read
 * and write in this tab is switched too, and names projects by their ids.
 */
export const projectFieldsAgain = (): Promise<ProjectFields | undefined> => {
  fileReads = undefined
  projectFields = undefined
  issueFields = undefined
  return projectFieldsNow()
}

/** `projectFieldsAgain` for issues, whose switch the relay makes apart from projects' (ISS-5). */
export const issueFieldsAgain = (): Promise<ProjectFields | undefined> => {
  fileReads = undefined
  projectFields = undefined
  issueFields = undefined
  return issueFieldsNow()
}

export const store = new Store(relay, signer, relayClockSkew, projectFieldsNow, inOrderTypes, issueFieldsNow)
