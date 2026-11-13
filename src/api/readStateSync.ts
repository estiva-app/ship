/**
 * Marking things read, and getting it onto the relay (CRO-8), and the merged
 * frontier the screen judges against.
 *
 * The write half is `@estiva-app/conversation`'s `createReadStateQueue`
 * (TOPIC-3), the one Leaf uses too: one queue for the tab, because NIP-RS is
 * one blob per **installation**; the whole blob on every publish, read back
 * from our own slot before each one; debounced on marks, never on the poll.
 * What stays here is Ship's own: where its slot is kept, what it is called,
 * which session may write, and the read half below.
 *
 * ## Debounced on read events, never on the poll
 *
 * Ship re-reads every 5 seconds. Hanging a publish off that would put a
 * `/nip44/encrypt`, a `/sign` and a bridge round trip on every tick, against a
 * budget of 120 operations per minute — and it would say nothing new, because a
 * refresh is not somebody reading anything. So `markRead` is called from the
 * pages, on the object being looked at, and the publish is debounced behind it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRefresh } from '@/lib/useRefresh'
import { relay, signer } from './store'
import { nip44, nip44UnlessRefused } from './nip44'
import { signedIn } from '../auth/estivaId'
import {
  READ_DWELL_MS,
  READ_STATE_HORIZON_DAYS,
  READ_STATE_PUBLISH_DEBOUNCE_MS,
  createReadStateQueue,
  createSlotCache,
  fetchReadState,
  readStateDTag,
  type FetchedReadState,
  type Nip44,
  type QueryFn,
  type ReadStateAttempt,
} from '@estiva-app/conversation'

/** Ship's slot, kept apart from anything else this app stores. Changing it gives every Ship user a fresh slot. */
export const SLOT_STORAGE_KEY = 'ship.readstate.slot'

/** Names Ship in a new `client_id`: `ship-1a2b3c4d`. Existing slots keep the one they have. */
const CLIENT_PREFIX = 'ship'

/** Long enough to batch opening a few issues, short enough to survive a tab close. */
export const PUBLISH_DEBOUNCE_MS = READ_STATE_PUBLISH_DEBOUNCE_MS

/** How long an object must be on screen before it counts as read: arrowing through an issue list burns nothing. */
export { READ_DWELL_MS }

/** How often the merged frontier is re-read. Deliberately not the 5s poll. */
export const READ_STATE_REFRESH_MS = 30_000

/** How soon a tab with no whole frontier yet asks again after a refused decrypt: long enough for `/nip44/*`'s per-minute quota to give some back. */
export const INCOMPLETE_RETRY_MS = 10_000

/** The relay, as the package's reads take it. */
const query: QueryFn = (filters) => relay.query(filters as never)

/** What the last flush attempt did, for the diagnostic below. */
let lastAttempt: { at: number; outcome: ReadStateAttempt; detail?: string; contexts?: number } | undefined
/** The last merged frontier this tab fetched, so the diagnostic need not re-fetch. */
let lastMerged: Record<string, number> = {}
/**
 * What the screen judges against: every frontier this tab fetched and every
 * mark it recorded, each context at its latest (SHI-38). Markers only grow
 * (§11.4), so nothing here can be older than the truth. Without it a mark
 * reached the screen only after the publish debounce and the next 30 s
 * re-read, and a re-read whose own slot would not decrypt (a 429 on
 * `/nip44/decrypt`) replaced the frontier with one missing your markers —
 * relighting everything you had read.
 */
let shown: Record<string, number> = {}
/** The mounted `useMergedReadState`s, told when `shown` moves. */
const shownListeners = new Set<() => void>()
/** Every frontier this tab fetched, each context at its latest; undefined until the first reachable fetch (99557309). */
let fetched: Record<string, number> | undefined
/** Every mark this tab recorded, each context at its latest — what `useOpeningReadState` leaves out of a visit that is still going. */
let marked: Record<string, number> = {}

/** `into` with each of `from`'s contexts raised to the later value; `into` itself when nothing moved. */
function laterOf(into: Record<string, number>, from: Readonly<Record<string, number>>): Record<string, number> {
  let out = into
  for (const [context, at] of Object.entries(from)) {
    if (out[context] !== undefined && out[context] >= at) continue
    if (out === into) out = { ...into }
    out[context] = at
  }
  return out
}

function show(from: Readonly<Record<string, number>>): void {
  const next = laterOf(shown, from)
  if (next === shown) return
  shown = next
  for (const listener of shownListeners) listener()
}

/**
 * The tab's one queue. Its own slot is read back with a decrypt that
 * **throws** whenever it does not decrypt: `nip44.decrypt` answers `undefined`
 * on a 429, which the queue would take for a slot that will never decrypt, and
 * it would move to a new slot on every rate limit.
 */
const queue = createReadStateQueue({
  storage: () => (typeof localStorage === 'undefined' ? undefined : localStorage),
  storageKey: SLOT_STORAGE_KEY,
  clientPrefix: CLIENT_PREFIX,
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  // The page's signer is one person for its life; an access token renewing mid-session only holds the write back.
  pubkey: () => signer.pubkey,
  canWrite: signedIn,
  query,
  nip44: {
    encrypt: (plaintext) => nip44.encrypt(plaintext),
    // Not even a "will never decrypt" answer moves Ship off its slot: `nip44UnlessRefused` gives one for any status
    // it does not know (a 400 or 404 while Estiva ID deploys), and a new slot would orphan everything read here.
    // Ship holds the publish instead, as it always has; another installation's blob still takes a new slot.
    decrypt: async (ciphertext) => {
      const plaintext = await nip44UnlessRefused.decrypt(ciphertext)
      if (plaintext === undefined) throw new Error('our read-state slot would not decrypt')
      return plaintext
    },
  },
  sign: (event) => signer.sign(event),
  publish: (event) => relay.publish(event),
  // On this screen at once, not after the publish and the next re-read.
  onMarked: (contexts) => {
    marked = laterOf(marked, contexts)
    show(contexts)
  },
  onAttempt: (outcome, detail, contexts) => {
    lastAttempt = { at: Date.now(), outcome, ...(detail ? { detail } : {}), ...(contexts !== undefined ? { contexts } : {}) }
  },
})

/**
 * What every slot last decrypted to, for the life of the tab: a refresh
 * decrypts only the slots that changed, and a slot refused with a 429 keeps
 * its last markers (Peek 23130326). Resets on a new pubkey.
 */
let slotCache = createSlotCache()

/**
 * Everything the relay holds of the person's read state, merged.
 *
 * `complete` is false when a decrypt was refused (a 429 above all): the package
 * then asks nothing more that round, and a slot this tab has not decrypted
 * before is missing from `merged` altogether — on a cold tab, most of them
 * (99557309, 7 Oct: four probes in a minute, five dividers).
 */
async function loadReadState(): Promise<FetchedReadState & { complete: boolean }> {
  let complete = true
  const decrypt: Pick<Nip44, 'decrypt'> = {
    decrypt: (ciphertext) =>
      nip44UnlessRefused.decrypt(ciphertext).catch((error: unknown) => {
        complete = false
        throw error
      }),
  }
  const state = await fetchReadState(query, signer.pubkey, decrypt, queue.identity(), Date.now(), READ_STATE_HORIZON_DAYS, slotCache)
  return { ...state, complete }
}

/** Publish anything pending now. */
export function flushReadState(): Promise<void> {
  return queue.flush()
}

/**
 * Mark a set of contexts read, now.
 *
 * Takes already-built context ids so the mapping decision stays in one place
 * (`@estiva-app/conversation`) and a caller cannot accidentally hand an issue address where
 * a container belongs — which is the mistake that would mark a whole project
 * read (SPEC §11.2).
 */
export function markRead(contexts: readonly (string | undefined)[], atMs: number = Date.now()): void {
  queue.markRead(contexts, atMs)
}

/** Test seam: drop the tab's state so a suite can start clean. */
export function resetReadStateForTests(): void {
  queue.reset()
  slotCache = createSlotCache()
  lastAttempt = undefined
  lastMerged = {}
  shown = {}
  fetched = undefined
  marked = {}
}

/** Flush before the tab goes away — `visibilitychange` is the one mobile fires. */
export function installReadStateFlush(): () => void {
  return queue.installFlushOnHide(document)
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
  // The tab's last frontier, so a page opened after the first read does not
  // judge everything against nothing: an empty frontier lights every reply
  // since you joined, which opens those threads, and an open thread is read (CON-34).
  // `shown` rather than the raw fetch, so this tab's own marks count at once.
  const [merged, setMerged] = useState<Record<string, number>>(() => shown)
  useEffect(() => {
    const listener = () => setMerged(shown)
    shownListeners.add(listener)
    listener()
    return () => void shownListeners.delete(listener)
  }, [])

  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mounted = useRef(false)
  const load = useCallback(async () => {
    if (!signedIn()) return
    try {
      const state = await loadReadState()
      // Unreachable is not empty — keep the last good frontier rather than
      // blanking every divider because one fetch failed. A reachable fetch
      // only raises it: one missing a slot it could not decrypt is not
      // evidence that anything became unread.
      if (state.reachable) {
        lastMerged = state.merged
        show(state.merged)
        // What a visit opens on (`useOpeningReadState`) is only ever a whole
        // frontier: one missing slots would hold every divider they cover for
        // the visit. Until there is one, ask again sooner than the cadence —
        // the slot cache keeps what decrypted, so each pass asks for less.
        if (state.complete) {
          const first = fetched === undefined
          fetched = laterOf(fetched ?? {}, state.merged)
          // The first is news even when it raised nothing: a page waiting to judge can now judge.
          if (first) for (const listener of shownListeners) listener()
        } else if (fetched === undefined && mounted.current) {
          // Not once the page has gone: a fetch that lands after the cleanup would otherwise retry for ever.
          clearTimeout(retry.current)
          retry.current = setTimeout(() => void load(), INCOMPLETE_RETRY_MS)
        }
      }
    } catch (error) {
      console.warn('[read-state] could not read the merged frontier:', error)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
      clearTimeout(retry.current)
    }
  }, [load])
  /*
   * Slower than Ship's 5s workspace poll, deliberately. Each pass costs a
   * `/sign`, a `/query` and one `/nip44/decrypt` per slot that changed since
   * the last pass — before the slot cache, per slot, which walked into the
   * 120-per-minute limit on `/nip44/*`, whose failure mode is an undecryptable own slot.
   * Read state moves at human speed; 30s matches what Peek settled on.
   */
  useRefresh(load, { intervalMs: READ_STATE_REFRESH_MS })

  return merged
}

/**
 * {@link useMergedReadState}, but `undefined` until the tab's first whole
 * frontier lands: a judge of many files waits rather than light every one of
 * them for a moment (SHIPS-2's topic dots).
 */
export function useLandedReadState(): Record<string, number> | undefined {
  const merged = useMergedReadState()
  return fetched === undefined ? undefined : merged
}

/**
 * The frontier a page visit opened on, held until the visit ends (99557309).
 *
 * `visit` names the visit — the address of the issue or project on screen —
 * and a new one takes a new frontier. What the screen judged against
 * `useMergedReadState` lost its divider as soon as it was drawn: the page's own
 * dwell marked what it drew, `shown` takes a mark at once, and the verdict
 * flipped about a second after the divider appeared. This answers the question
 * the divider asks instead, "new since you last read this", with "last" meaning
 * before this visit: every fetched frontier and every mark recorded before the
 * visit began, and none of the marks it made since.
 *
 * Undefined until the tab's first fetch lands, so a cold tab judges nothing
 * rather than everything since you joined (four dividers, gone a second later).
 * It does not fetch: the page's `useMergedReadState` does.
 */
export function useOpeningReadState(visit: string | undefined): Readonly<Record<string, number>> | undefined {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender((n) => n + 1)
    shownListeners.add(listener)
    listener()
    return () => void shownListeners.delete(listener)
  }, [])
  const [opening, setOpening] = useState<{ visit: string | undefined; before: Record<string, number>; frontier?: Record<string, number> }>(() => ({
    visit,
    before: marked,
    frontier: fetched && laterOf(fetched, marked),
  }))
  let current = opening
  if (current.visit !== visit) current = { visit, before: marked, frontier: fetched && laterOf(fetched, marked) }
  else if (!current.frontier && fetched) current = { ...current, frontier: laterOf(fetched, current.before) }
  if (current !== opening) setOpening(current)
  return visit === undefined ? undefined : current.frontier
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
 * __readState.shown('<context>')     the same, as the screen judges it
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
  /** What the screen judges against: every fetch and every mark here, each context at its latest. */
  shown: Record<string, number>
}

function snapshot(): ReadStateDiagnostic {
  const id = queue.identity()
  const { known, pending, published, hydrated, retryMs } = queue.state()
  return {
    slot: readStateDTag(id.slotId),
    clientId: id.clientId,
    known,
    pending,
    published,
    hydrated,
    retryInS: Math.round(retryMs / 1000),
    lastAttempt,
    merged: { ...lastMerged },
    shown: { ...shown },
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
    const state = await loadReadState()
    if (state.reachable) {
      lastMerged = state.merged
      show(state.merged)
    }
    return { reachable: state.reachable, ownUndecryptable: state.ownUndecryptable, contexts: Object.keys(state.merged).length }
  }
  fn.marker = (context: string) => {
    const at = lastMerged[context]
    return at === undefined ? 'absent' : `${at}  ${new Date(at * 1000).toISOString()}`
  }
  fn.shown = (context: string) => {
    const at = shown[context]
    return at === undefined ? 'absent' : `${at}  ${new Date(at * 1000).toISOString()}`
  }
  ;(window as unknown as Record<string, unknown>).__readState = fn
}
