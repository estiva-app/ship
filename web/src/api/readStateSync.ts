/**
 * Marking things read, and getting it onto the relay (CRO-8).
 *
 * One queue for the tab, because NIP-RS is one blob per **installation**. A
 * per-component queue would hold a partial context map each, and since the blob
 * is a replaceable snapshot they would take turns overwriting one another's
 * contexts — the whole-blob rule broken by construction rather than by a bug.
 *
 * ## Debounced on read events, never on the poll
 *
 * Ship re-reads every 5 seconds. Hanging a publish off that would put a
 * `/nip44/encrypt`, a `/sign` and a bridge round trip on every tick, against a
 * budget of 120 operations per minute — and it would say nothing new, because a
 * refresh is not somebody reading anything. So `markRead` is called from the
 * pages, on the object being looked at, and the publish is debounced behind it.
 *
 * ## Whole blob, always
 *
 * The coordinate is replaced, not patched, so every publish carries the complete
 * map. That is why this hydrates from the relay before its first write: a
 * partial blob does not fail, it silently drops every context it omitted, and
 * because the cross-slot merge is grow-only the loss stays invisible until this
 * is the last slot standing.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRefresh } from '@/lib/useRefresh'
import { relay, signer } from './store'
import { nip44 } from './nip44'
import { signedIn } from '../auth/estivaId'
import {
  advanceContexts,
  fetchMergedReadState,
  loadSlotIdentity,
  publishReadState,
  readStateDTag,
  toContextSeconds,
  type SlotIdentity,
} from './readState'

/** Long enough to batch opening a few issues, short enough to survive a tab close. */
export const PUBLISH_DEBOUNCE_MS = 3000

/**
 * How long an object must be on screen before it counts as read.
 *
 * Without a dwell, arrowing through an issue list would burn every issue's
 * unread state on the way past. Peek uses the same idea for the same reason.
 */
export const READ_DWELL_MS = 1500

/** How often the merged frontier is re-read. Deliberately not the 5s poll. */
export const READ_STATE_REFRESH_MS = 30_000

let identity: SlotIdentity | undefined
/** Everything this slot knows: hydrated from the relay, plus what was recorded. */
let known: Record<string, number> = {}
/** Recorded but not yet in an accepted publish. */
let pending: Record<string, number> = {}
/** What the relay is believed to hold, so an unchanged blob is not republished. */
let published: Record<string, number> | undefined
let hydrated = false
let hydrating: Promise<void> | undefined
let timer: ReturnType<typeof setTimeout> | undefined
/** Grows while a flush keeps failing, so a long outage is not a busy loop. */
let retryMs = 0
let inFlight: Promise<void> = Promise.resolve()

/** What the last flush attempt did, for the diagnostic below. */
let lastAttempt: { at: number; outcome: string; detail?: string; contexts?: number } | undefined
/** The last merged frontier this tab fetched, so the diagnostic need not re-fetch. */
let lastMerged: Record<string, number> = {}

function noteAttempt(outcome: string, detail?: string, contexts?: number): void {
  lastAttempt = { at: Date.now(), outcome, ...(detail ? { detail } : {}), ...(contexts !== undefined ? { contexts } : {}) }
}

function currentIdentity(): SlotIdentity {
  if (!identity) identity = loadSlotIdentity()
  return identity
}

const sameContexts = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

async function hydrate(): Promise<void> {
  if (hydrated) return
  if (!hydrating) {
    hydrating = (async () => {
      const state = await fetchMergedReadState(relay, signer.pubkey, nip44, currentIdentity())
      /*
       * Unreachable is not empty. Staying unhydrated means the next attempt
       * tries again; treating it as empty would publish a blob that drops every
       * context recorded before this session. An empty *coordinate*, by
       * contrast, is the ordinary first run and hydrates to nothing — the
       * distinction Peek had to ship a fix for.
       */
      if (!state.reachable) return
      /*
       * Our slot is there and unreadable — almost always a `429` from
       * `/nip44/decrypt`. Publishing now would replace it with only what this
       * session recorded and drop the rest, permanently. Stay unhydrated and
       * try again; a transient rate limit must not cost read state.
       */
      if (state.ownUndecryptable) {
        console.warn('[read-state] own slot could not be decrypted; not publishing over it')
        return
      }
      /*
       * Seeded from **our own slot**, not from the merge.
       *
       * Seeding from the merge looked harmless — the rule is a maximum, so
       * carrying another installation's contexts loses nothing — and the
       * cross-app verification showed what it actually costs: Ship's slot came
       * back holding 53 contexts against Peek's 47, having absorbed Peek's and
       * republished them as its own. Every slot converges to the union.
       *
       * Nothing is *wrong* with that, and two things about it are bad. Each
       * slot becomes O(everything the person has read) rather than O(what this
       * app read), so all of them approach the reference client's 32,768-byte
       * plaintext limit together instead of one at a time. And `client_id`
       * stops meaning "the app that read this", which is the only signal there
       * is about where a marker came from.
       *
       * A slot is this installation's account of what *it* read. The union is
       * what the merge is for, and it is computed at read time.
       */
      known = advanceContexts(state.own?.contexts ?? {}, known)
      published = state.own?.contexts ?? {}
      hydrated = true
    })().finally(() => {
      hydrating = undefined
    })
  }
  await hydrating
}

/** Publish anything pending now. */
/**
 * Try again later, because markers are still pending.
 *
 * Every early return below leaves `pending` populated, and the debounce timer
 * has already fired and been cleared — so without this the markers sit stranded
 * until the next `record` or the tab is hidden. Observed twice: once behind a
 * `/nip44` rate limit and once behind an access token expiring mid-session, and
 * both times reading an issue simply never reached the relay.
 *
 * Backs off so a long outage is not a busy loop, and resets on success.
 */
function retryLater(): void {
  if (timer !== undefined) return
  retryMs = retryMs === 0 ? PUBLISH_DEBOUNCE_MS : Math.min(retryMs * 2, 60_000)
  timer = setTimeout(() => {
    timer = undefined
    void flushReadState()
  }, retryMs)
}

export function flushReadState(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  inFlight = inFlight.then(async () => {
    if (Object.keys(pending).length === 0) return noteAttempt('nothing-pending')
    // No usable token — an access token expiring mid-session is ordinary, and
    // the signer renews itself. Keep the markers and come back.
    if (!signedIn()) {
      noteAttempt('no-session', 'retrying')
      return retryLater()
    }
    await hydrate()
    // Unreachable, or our own slot is there and unreadable. Both mean we must
    // not publish; neither means the markers should be abandoned.
    if (!hydrated) {
      noteAttempt('not-hydrated', 'relay unreachable, or our slot would not decrypt; retrying')
      return retryLater()
    }
    const sending = pending
    const contexts = { ...known }
    pending = {}
    // Hydration can supersede everything pending — a marker older than the
    // relay's own is not a change, and republishing an identical blob costs
    // three round trips to say nothing.
    if (published && sameContexts(published, contexts)) return noteAttempt('unchanged')
    try {
      const result = await publishReadState(relay, signer, nip44, currentIdentity(), contexts)
      if (result.ok) {
        published = contexts
        retryMs = 0
        noteAttempt('published', undefined, Object.keys(contexts).length)
      } else {
        console.warn('[read-state] publish rejected:', result.reason)
        noteAttempt('rejected', result.reason)
        pending = advanceContexts(pending, sending)
        retryLater()
      }
    } catch (error) {
      console.warn('[read-state] publish failed:', error)
      noteAttempt('failed', error instanceof Error ? error.message : String(error))
      pending = advanceContexts(pending, sending)
      retryLater()
    }
  })
  return inFlight
}

function record(context: string | undefined, atMs: number): void {
  if (!context) return
  const seconds = toContextSeconds(atMs)
  const advanced = advanceContexts(known, { [context]: seconds })
  // `advanceContexts` drops what it will not publish, so an unchanged map means
  // the marker was invalid or not newer. Scheduling anyway would republish an
  // identical blob.
  if (advanced[context] === known[context]) return
  known = advanced
  pending = advanceContexts(pending, { [context]: seconds })
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void flushReadState()
  }, PUBLISH_DEBOUNCE_MS)
}

/**
 * Mark a set of contexts read, now.
 *
 * Takes already-built context ids so the mapping decision stays in one place
 * (`readState.ts`) and a caller cannot accidentally hand an issue address where
 * a container belongs — which is the mistake that would mark a whole project
 * read (SPEC §11.2).
 */
export function markRead(contexts: (string | undefined)[], atMs: number = Date.now()): void {
  for (const context of contexts) record(context, atMs)
}

/** Test seam: drop the tab's state so a suite can start clean. */
export function resetReadStateForTests(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  identity = undefined
  known = {}
  pending = {}
  published = undefined
  hydrated = false
  retryMs = 0
  lastAttempt = undefined
  lastMerged = {}
  hydrating = undefined
  inFlight = Promise.resolve()
}

/** Flush before the tab goes away — `visibilitychange` is the one mobile fires. */
export function installReadStateFlush(): () => void {
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flushReadState()
  }
  document.addEventListener('visibilitychange', onHidden)
  return () => document.removeEventListener('visibilitychange', onHidden)
}

/**
 * The person's merged read frontier, kept fresh (CRO-13).
 *
 * Ship has no database to reconcile, so the merged state **is** its read state —
 * there is no cache and no dual-run, because there is no incumbent to compare
 * against. That is the whole reason Ship was the easy side.
 *
 * Refreshed on Ship's ordinary cadence rather than a private one: the same
 * `useRefresh` every other read here uses, so a tab that has been hidden does
 * not show a ten-minute-old frontier the moment it is looked at.
 *
 * Returns an empty map until the first fetch settles. That reads as "nothing is
 * new", which is the right way to be wrong for a moment — the alternative
 * flashes a divider onto every thread and then takes it away.
 */
export function useMergedReadState(): Record<string, number> {
  const [merged, setMerged] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    if (!signedIn()) return
    try {
      const state = await fetchMergedReadState(relay, signer.pubkey, nip44, currentIdentity())
      // Unreachable is not empty — keep the last good frontier rather than
      // blanking every divider because one fetch failed.
      if (state.reachable) {
        setMerged(state.merged)
        lastMerged = state.merged
      }
    } catch (error) {
      console.warn('[read-state] could not read the merged frontier:', error)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  /*
   * Slower than Ship's 5s workspace poll, deliberately. Each pass costs a
   * `/sign`, a `/query` and one `/nip44/decrypt` **per slot** — at 5s that is
   * a request every few hundred milliseconds and it walks into the 120-per-
   * minute limit on `/nip44/*`, whose failure mode is an undecryptable own slot.
   * Read state moves at human speed; 30s matches what Peek settled on.
   */
  useRefresh(load, { intervalMs: READ_STATE_REFRESH_MS })

  return merged
}

// ---------------------------------------------------------------------------
// The diagnostic
// ---------------------------------------------------------------------------

/**
 * `window.__readState()` — what this tab believes about read state.
 *
 * Exists because verifying this by hand cost four rounds with a person driving a
 * browser, and three of those failed on the *test* rather than the system: a
 * hand-rolled devtools snippet re-implemented the bridge and got the query shape,
 * the NIP-98 nonce and the response envelope wrong in turn, and none of it could
 * see the one thing that mattered — whether a marker had actually been published,
 * or was sitting in `pending` behind a transient failure.
 *
 * Read-only apart from the two explicit verbs. It reports this tab's private
 * queue state, which is exactly what no external probe can observe.
 *
 * ```
 * __readState()                      what is known, pending, published, and why
 * __readState.flush()                publish now instead of waiting for the debounce
 * __readState.refresh()              re-read the merged frontier from the relay
 * __readState.marker('<context>')    one context's merged value, as a date
 * ```
 */
export interface ReadStateDiagnostic {
  slot: string
  clientId: string
  /** Everything this slot believes it has read. */
  known: Record<string, number>
  /** Recorded but not yet in an accepted publish. Non-empty here is the smell. */
  pending: Record<string, number>
  /** What the relay is believed to hold for our slot. */
  published: Record<string, number> | undefined
  hydrated: boolean
  /** Seconds until the next retry, or 0 when nothing is scheduled. */
  retryInS: number
  /** The last flush attempt and how it ended. */
  lastAttempt: typeof lastAttempt
  /** The merged frontier as of the last fetch. */
  merged: Record<string, number>
}

function snapshot(): ReadStateDiagnostic {
  const id = currentIdentity()
  return {
    slot: readStateDTag(id.slotId),
    clientId: id.clientId,
    known: { ...known },
    pending: { ...pending },
    published: published ? { ...published } : undefined,
    hydrated,
    retryInS: Math.round(retryMs / 1000),
    lastAttempt,
    merged: { ...lastMerged },
  }
}

/**
 * Attach it. Called once from the api barrel's module scope.
 *
 * Not gated on a build flag: Ship is an internal tool, this reads only the
 * viewer's own state in their own browser, and a diagnostic that is absent from
 * production is a diagnostic that is never there when it is needed.
 */
export function installReadStateDiagnostic(): void {
  if (typeof window === 'undefined') return
  const fn = () => snapshot()
  fn.flush = async () => {
    await flushReadState()
    return snapshot().lastAttempt
  }
  fn.refresh = async () => {
    const seam = signedIn()
    if (!seam) return 'no session'
    const state = await fetchMergedReadState(relay, signer.pubkey, nip44, currentIdentity())
    if (state.reachable) lastMerged = state.merged
    return { reachable: state.reachable, ownUndecryptable: state.ownUndecryptable ?? false, contexts: Object.keys(state.merged).length }
  }
  fn.marker = (context: string) => {
    const at = lastMerged[context]
    return at === undefined ? 'absent' : `${at}  ${new Date(at * 1000).toISOString()}`
  }
  ;(window as unknown as Record<string, unknown>).__readState = fn
}
