import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRetryingRead } from '@estiva-app/platform'
import { activityTopics, addableTopics, readTopicActivity, type ReadTopic, type TopicsRead, type YourTopicsRead } from '@estiva-app/interop'
import { readAllTopics, readSidebarTopics, readTopicDocuments, readTopicMembers, readTopicPlace, topicAsDrawn, type ForeignObject, type FolderSummary, type TopicOfFile } from './foreign'
import { knowSpaces, knowSpacesAmong } from '@/lib/topicLinks'
import { foldersNow, heldFolders } from './useFolders'
import { useLandedReadState } from './readStateSync'
import { readMuted } from './useFeedJudges'
import { nip44 } from './nip44'
import { relay, signer } from './store'

/**
 * Every topic the reader can read, held per tab (SHIPS-2) — interop's
 * `readTopics`, held as the Folder listing is (`useFolders`), so Add to topic
 * opened again draws at once while it reads again, and opens filled once the
 * Topics page has read them (SHIPS-3). Not retried on its own: the next open
 * reads, or Try again, and a failed read never replaces a good one.
 */
const held = createRetryingRead<TopicsRead>({ retryable: () => false })

/** The order this tab's reads landed in, by the answer each gave (ALO-17): the sidebar draws its five from the latest. */
const landings = new WeakMap<object, number>()
let landingsSoFar = 0
function stampLanding(value: object | undefined): void {
  if (value && !landings.has(value)) landings.set(value, ++landingsSoFar)
}
/** When an answer landed, in this tab's order of landings; 0 for none. */
export function landedAt(value: object | undefined): number {
  return (value && landings.get(value)) || 0
}

// A link to a space opens Peek, not the topic's page (SHIPS-4): each read says which topics are spaces.
held.subscribe(() => {
  const read = held.snapshot().value
  stampLanding(read)
  if (read) knowSpaces(read)
})

/** Every topic, read now or joining a read on the way; rejects while there is none to give. */
async function topicsFresh(): Promise<TopicsRead> {
  await held.reload(readAllTopics)
  const { value, error } = held.snapshot()
  if (value) return value
  throw error ?? new Error('Topics could not be read.')
}

/** Test seam: forget the held topics and choices. */
export function resetTopicsForTests(): void {
  held.clear()
  yourRead.clear()
  yoursReadAt = 0
  activity.reset()
  members.reset()
  mutes.reset()
  choices = undefined
  knowSpaces({ topics: [] } as unknown as TopicsRead)
}

/** The Topics page's read: `undefined` while the first one is out, `failed` when it did not land. */
export type TopicsState = TopicsRead | 'failed' | undefined

/**
 * Read the topics afresh as the Topics route opens, beside the workspace and
 * before the page mounts, so a topic started since shows; joins a read on the
 * way. This is the open's one read: the page draws it, and reads only when
 * nothing is held or on the way (155 relay reads were two of each, SHIPS-3).
 */
export function prefetchTopics(): Promise<void> {
  return held.reload(readAllTopics)
}

/**
 * Every topic the reader can read, for the Topics page (SHIPS-3): the held
 * answer at once, or the route's read on the way ({@link prefetchTopics}).
 * `failed` only once this open's read has failed: an error left by an earlier
 * read is not this one's. `on` false (the sidebar away from Topics) reads
 * nothing and answers what the tab holds, if anything.
 */
export function useTopics(on = true): TopicsState {
  const snapshot = useSyncExternalStore(held.subscribe, held.snapshot)
  const [settled, setSettled] = useState(false)
  // Turned on again, a read starts: an error an earlier one left is not this one's.
  const [wasOn, setWasOn] = useState(on)
  if (wasOn !== on) {
    setWasOn(on)
    if (on) setSettled(false)
  }
  useEffect(() => {
    if (!on) return
    let live = true
    void held.ensure(readAllTopics).finally(() => live && setSettled(true))
    return () => {
      live = false
    }
  }, [on])
  // Off, it reads nothing but still hands over what the tab holds.
  if (!on) return snapshot.value
  return snapshot.value ?? (settled && snapshot.error !== undefined ? 'failed' : undefined)
}

/**
 * Only your topics, newest first (ALO-17): interop's lean read, held per tab,
 * what the sidebar draws on every page but Topics and a topic's. Read when the
 * first such page opens, and again when you come back to the tab
 * {@link REREAD_AFTER_MS} after the last read, never live, as the five have
 * always moved (Miky, 6 Nov). Not retried on its own: Try again reads.
 */
const yourRead = createRetryingRead<YourTopicsRead>({ retryable: () => false })
yourRead.subscribe(() => stampLanding(yourRead.snapshot().value))
/** When the lean read was last asked for, so a quick look away and back reads nothing. */
let yoursReadAt = 0
const readYours = async () => {
  yoursReadAt = Date.now()
  const asked = mutes.ticket()
  const read = await readSidebarTopics((ciphertext) => nip44.decrypt(ciphertext))
  // Which of yours are spaces, for every link to one; and the mute list it opened, for the tab's one list.
  knowSpacesAmong(read.topics)
  if (read.muted) mutes.give(read.muted, asked)
  return read
}

/** The lean read of your topics, while `on`: `undefined` while the first one is out, `failed` when it did not land. Off, what the tab holds, read nothing. */
export function useYourTopics(on: boolean): { read: YourTopicsRead | 'failed' | undefined; retry: () => void } {
  const snapshot = useSyncExternalStore(yourRead.subscribe, yourRead.snapshot)
  const [settled, setSettled] = useState(false)
  // Turned on again, a read starts: an error an earlier one left is not this one's.
  const [wasOn, setWasOn] = useState(on)
  if (wasOn !== on) {
    setWasOn(on)
    if (on) setSettled(false)
  }
  useEffect(() => {
    if (!on) return
    let live = true
    void yourRead.ensure(readYours).finally(() => live && setSettled(true))
    const onReturn = () => {
      if (document.visibilityState === 'visible' && Date.now() - yoursReadAt > REREAD_AFTER_MS) void yourRead.reload(readYours)
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [on])
  // Off, it reads nothing but still hands over what the tab holds.
  const read = !on ? snapshot.value : (snapshot.value ?? (settled && snapshot.error !== undefined ? ('failed' as const) : undefined))
  return { read, retry: () => void yourRead.reload(readYours) }
}

/**
 * A topic's page reads the topics only when none are held or on the way
 * (SHIPS-4): opened from Topics it draws from that read, with no request.
 */
export function ensureTopics(): Promise<unknown> {
  return held.ensure(readAllTopics)
}

/**
 * The Leaf documents a topic's page lists, with their titles: one read for
 * all of them (SHIPS-4). `undefined` while it reads, `failed` when it did not
 * land. `key` is their addresses, space-separated.
 */
export function useTopicDocuments(key: string): { documents: ForeignObject[] | 'failed' | undefined; retry: () => void } {
  const [answer, setAnswer] = useState<{ key: string; value: ForeignObject[] | 'failed' }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    readTopicDocuments(key ? key.split(' ') : []).then(
      (value) => live && setAnswer({ key, value }),
      () => live && setAnswer({ key, value: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [key, attempt])
  const documents = answer?.key === key ? answer.value : undefined
  return { documents, retry: () => setAttempt((n) => n + 1) }
}

/**
 * Who a topic lists, and its own events, for its page's members pill (TOPI-8): one read when the page opens and
 * again after a Join, Leave or Add. `undefined` until it lands; a failed read keeps the pill out, as a file's does.
 */
export function useTopicPlace(topic: { address: string; folder: string } | undefined): { place: Awaited<ReturnType<typeof readTopicPlace>> | undefined; reload: () => Promise<void> } {
  const [answer, setAnswer] = useState<{ key: string; value: Awaited<ReturnType<typeof readTopicPlace>> }>()
  const key = topic ? `${topic.address} ${topic.folder}` : ''
  const load = useCallback(async () => {
    if (!topic) return
    try {
      const value = await readTopicPlace(topic)
      setAnswer({ key, value })
    } catch (error) {
      console.warn('[topics] members:', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the topic
  }, [key])
  useEffect(() => {
    void load()
  }, [load])
  return { place: answer?.key === key ? answer.value : undefined, reload: load }
}

/** Read every topic again; whether that read landed (a failed one keeps the topics already held). */
export async function rereadTopics(): Promise<boolean> {
  // The held read says an error only while it has no answer to keep, so the failure is caught on its way.
  let landed = true
  await held.reload(() =>
    readAllTopics().catch((error: unknown) => {
      landed = false
      throw error
    }),
  )
  return landed
}

/** Try again after a failed read: read every topic now. */
export function reloadTopics(): Promise<void> {
  return held.reload(readAllTopics)
}

/**
 * Your mute list, held per tab and shared by every hook that asks (ALO-17):
 * Topics and the sidebar beside it read it once between them. `round` moves
 * when you come back to the tab and the topics are read again
 * ({@link useTopicsOnReturn}), so a topic muted or unmuted elsewhere moves then.
 * The lean read of your topics opens the same list and hands it over
 * ({@link give}), so moving from Issues to Topics reads it no second time.
 * Every answer carries the ticket taken when its read was asked, and only a
 * newer one replaces the list held: a slow, older answer landing last never wins.
 */
const mutes = (() => {
  let now: { muted?: ReadonlySet<string>; settled: boolean; round: number; ticket: number } = { settled: false, round: -1, ticket: 0 }
  let round = 0
  let reading: { round: number } | undefined
  /** A read in flight across a reset writes nothing. */
  let epoch = 0
  let tickets = 0
  const listeners = new Set<() => void>()
  const tell = () => {
    for (const listener of listeners) listener()
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    snapshot: () => now,
    round: () => round,
    /** Read the list, unless a read for this round is on the way. */
    read(at: number) {
      if (reading && reading.round >= at) return
      const mine = { round: at }
      reading = mine
      const from = epoch
      const ticket = ++tickets
      const land = (next: (was: typeof now) => typeof now) => {
        if (from !== epoch) return
        if (reading === mine) reading = undefined
        now = next(now)
        tell()
      }
      void readMuted((filters) => relay.query(filters as never), (ciphertext) => nip44.decrypt(ciphertext), signer.pubkey).then(
        (keys) => land((was) => (keys && ticket > was.ticket ? { muted: keys, settled: true, round: at, ticket } : { ...was, settled: true })),
        () => land((was) => ({ ...was, settled: true })),
      )
    },
    /** A ticket for a read of the list made elsewhere, taken as it is asked. */
    ticket: () => ({ ticket: ++tickets, epoch, round }),
    /** The list another read opened, held for the round it was asked in unless a newer answer is. */
    give(keys: ReadonlySet<string>, asked: { ticket: number; epoch: number; round: number }) {
      if (asked.epoch !== epoch || asked.ticket <= now.ticket) return
      now = { muted: keys, settled: true, round: asked.round, ticket: asked.ticket }
      tell()
    },
    again() {
      round += 1
      tell()
    },
    reset() {
      epoch += 1
      now = { settled: false, round: -1, ticket: 0 }
      round = 0
      tickets = 0
      reading = undefined
    },
  }
})()

/**
 * The files and channels you muted (`estiva:muted:v1`, encrypted to you):
 * `muted` is `undefined` until the list is in hand, and `settled` once the
 * first read came back, in hand or not. One read for the tab, shared by every
 * page and the sidebar; asked again when your read state moves while the list
 * would not decrypt (a busy nip44), rather than never, and when you come back
 * to the tab and the topics are read again. `on` false reads nothing and
 * answers what the tab holds.
 */
export function useMuted(on = true): { muted: ReadonlySet<string> | undefined; settled: boolean } {
  const merged = useLandedReadState()
  const now = useSyncExternalStore(mutes.subscribe, mutes.snapshot)
  const round = useSyncExternalStore(mutes.subscribe, mutes.round)
  useEffect(() => {
    if (!on || (now.muted && now.round >= round)) return
    mutes.read(round)
  }, [on, now.muted, now.round, round, merged])
  return { muted: now.muted, settled: now.settled }
}

/** How long after a read coming back to the tab reads again: a quick look away and back reads nothing. */
export const REREAD_AFTER_MS = 60_000

/** A per-topic answer as a page draws it: `undefined` while it is read, `failed` when it did not land. */
export interface PerTopic<T> {
  values: ReadonlyMap<string, T> | undefined
  failed: boolean
  retry: () => void
}

/**
 * One answer per topic, read for a set of topics at a time and held in this
 * tab across pages, so the sidebar and Explore topics share it and a page
 * opened again reads nothing it holds (TOPI-9). Read again when you come back
 * to the tab, {@link REREAD_AFTER_MS} after the last read, and never while
 * you are working in it: a topic moves on the next open or the next return,
 * not under the pointer (Miky, 6 Nov). No live watch.
 */
function perTopicRead<T>(read: (topics: ReadTopic[]) => Promise<ReadonlyMap<string, T>>, { onReturn: rereads = true } = {}) {
  let values = new Map<string, T>()
  const failed = new Set<string>()
  const inFlight = new Map<string, Promise<void>>()
  /** When each topic's answer was last read, by its address. */
  const readAt = new Map<string, number>()
  const listeners = new Set<() => void>()
  let version = 0
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const load = (key: string, topics: ReadTopic[]): Promise<void> => {
    const on = inFlight.get(key)
    if (on) return on
    const reading = read(topics)
      .then(
        (next) => {
          values = new Map([...values, ...next])
          stampLanding(values)
          failed.delete(key)
          for (const address of next.keys()) readAt.set(address, Date.now())
        },
        (error: unknown) => {
          console.warn('[topics] could not read:', error)
          failed.add(key)
        },
      )
      .finally(() => {
        inFlight.delete(key)
        version += 1
        for (const listener of listeners) listener()
      })
    inFlight.set(key, reading)
    return reading
  }
  return {
    reset() {
      values = new Map()
      failed.clear()
      inFlight.clear()
      readAt.clear()
    },
    /** `addresses`: the topics to answer for; `undefined` while which ones is not known. */
    /**
     * `values` once every topic asked is answered, and from then on: a topic
     * asked later (joined, or started) is read on its own and has no answer
     * until it lands, so what is drawn never goes back to loading.
     */
    useRead(topics: TopicsRead | undefined, addresses: readonly string[] | undefined): PerTopic<T> {
      useSyncExternalStore(subscribe, () => version)
      const key = addresses ? [...addresses].sort().join(' ') : undefined
      const asked = () => {
        const wanted = new Set(key ? key.split(' ') : [])
        return topics?.topics.filter((topic) => wanted.has(topic.address)) ?? []
      }
      const drew = useRef(false)
      useEffect(() => {
        if (!topics || key === undefined) return
        const wanted = asked()
        // Only what is not held: the sidebar's topics are held when Explore asks for all of them.
        const missing = wanted.filter((topic) => !values.has(topic.address))
        if (missing.length > 0) void load(missing.map((topic) => topic.address).join(' '), missing)
        if (!rereads) return
        const onReturn = () => {
          const stale = wanted.some((topic) => Date.now() - (readAt.get(topic.address) ?? 0) > REREAD_AFTER_MS)
          if (document.visibilityState === 'visible' && stale) void load(key, wanted)
        }
        document.addEventListener('visibilitychange', onReturn)
        return () => document.removeEventListener('visibilitychange', onReturn)
        // `asked` is `topics` and `key`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [topics, key])
      const all = key !== undefined && (key === '' || key.split(' ').every((address) => values.has(address)))
      if (all) drew.current = true
      const missingKey = () =>
        asked()
          .filter((topic) => !values.has(topic.address))
          .map((topic) => topic.address)
          .join(' ')
      return {
        values: all || drew.current ? values : undefined,
        failed: !all && !drew.current && key !== undefined && failed.has(missingKey()),
        retry: () => {
          const missing = asked().filter((topic) => !values.has(topic.address))
          if (missing.length > 0) void load(missingKey(), missing)
        },
      }
    },
  }
}

/**
 * Each topic's newest activity, the one rule Peek, Ship and Leaf order topics
 * by (interop's `readTopicActivity`, TOPI-10): the sidebar's five and Your
 * topics, and Explore's Last active.
 */
const activity = perTopicRead<number>(async (topics) => (await readTopicActivity((filters) => relay.query(filters as never), activityTopics(topics))).at)

/**
 * How many people each topic lists (record a-place-lists-who-chose-a-level-and-its-teams-members): Explore's Members.
 * Read once per topic in a tab, not again on return: it reads each topic's whole roster and changes, and a count a minute old orders nothing.
 */
const members = perTopicRead<number | undefined>((topics) => readTopicMembers(topics), { onReturn: false })

export const useTopicActivity = activity.useRead
export const useTopicMembers = members.useRead

/**
 * Read the topics again when you come back to the tab (TOPI-9), at most once
 * a {@link REREAD_AFTER_MS}: a topic joined in Peek, or started since, enters
 * the sidebar's five then, never while you work; your mute list with them.
 * Only while `on`: on Topics and a topic's page, where the sidebar draws from
 * every topic's read.
 */
export function useTopicsOnReturn(on = true): void {
  useEffect(() => {
    if (!on) return
    let last = Date.now()
    const onReturn = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last <= REREAD_AFTER_MS) return
      last = Date.now()
      void rereadTopics()
      mutes.again()
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => document.removeEventListener('visibilitychange', onReturn)
  }, [on])
}

/** Add to topic's choices: the topics you are a member of, then the rest. */
export interface TopicChoices {
  yours: TopicOfFile[]
  others: TopicOfFile[]
}

const drawn = (topic: ReadTopic) => topicAsDrawn(topic.address, topic.folder, topic.object)

/** The last choices, so an unchanged read draws the same object. */
let choices: { read: TopicsRead; folders: FolderSummary[]; value: TopicChoices } | undefined

function choicesOf(read: TopicsRead, folders: FolderSummary[]): TopicChoices {
  if (choices?.read === read && choices.folders === folders) return choices.value
  const { yours, others } = addableTopics(read, new Set(folders.map((folder) => folder.id)))
  const value = { yours: yours.map(drawn), others: others.map(drawn) }
  choices = { read, folders, value }
  return value
}

/** Add to topic's choices from what this tab holds, for the palette to draw at once; `undefined` before the first read. */
export function topicChoicesNow(): TopicChoices | undefined {
  const read = held.snapshot().value
  const folders = heldFolders()
  return read && folders ? choicesOf(read, folders) : undefined
}

/**
 * What Add to topic offers (TOP-5, SHIPS-2): the open topics in a Folder the
 * relay lists for you — where it accepts your entry — yours first, then the
 * rest, each A–Z; none archived, by itself or with its project. Read afresh
 * on each open, so a topic made or archived since shows; the palette draws
 * {@link topicChoicesNow} until this lands.
 */
export async function readTopicChoices(): Promise<TopicChoices> {
  const [read, folders] = await Promise.all([topicsFresh(), foldersNow()])
  return choicesOf(read, folders)
}
