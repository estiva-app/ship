/**
 * Who is judging a feed, and on what terms — SPEC §11.8 (CON-19).
 *
 * `unreadIn` needs, per stream, whether the reader is a **member**, since when,
 * and whether they muted it. This reads those three facts for the file a page
 * is about, from public events, the way every app computes them:
 *
 * - membership is `membershipOf`'s fold over the file's root, its stream and
 *   its `kind:1851` changes — one request carrying two filters, `#a` for the
 *   changes and `#A` for the stream (a reply drops the lowercase `a`);
 * - the mute list (`estiva:muted:v1`, a private blob) rides in the same request
 *   as a third filter, and is decrypted only when it is a different event from
 *   the last one seen. Ship **reads** it so that what Peek muted stays quiet
 *   here; Ship has no way to mute and writes nothing.
 *
 * ## Why not the discovery filters
 *
 * The package's `membershipFilters` find every file a person *may* belong to,
 * and exist for a surface that lights a list of files. Ship has none (§11.8: no
 * lighting for a stream with no screen), and a page already knows which file it
 * is about, so what it needs is that one file's fold. The discovery query is
 * the right call the day Ship gets a list that lights.
 *
 * ## The channel has nothing to read
 *
 * A Folder has no read or unread (Miky, 2026-10-01): nobody is a member of its
 * own chat, so the project page's record channel is judged with `member: false`
 * and lights only for a message that names you — as in Peek. With no marker
 * (`floor` beyond every `created_at`) not even that counts, the quiet first
 * run this feed has always had; the page's marker takes over after the first
 * visit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MUTED_D_TAG,
  membersOf,
  membershipOf,
  mutedFilter,
  parseMutedBlob,
  type Membership,
  type QueryFn,
  type StreamJudge,
} from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'
import { useRefresh } from '@/lib/useRefresh'
import { KIND } from '../nostr/kinds'
import { signedIn } from '../auth/estivaId'
import { nip44 } from './nip44'
import { relay, signer } from './store'

/** How often membership and mutes are re-read: the read state's cadence, since they move at the same speed. */
const FEED_FACTS_REFRESH_MS = 30_000

/** The file a page is about, as far as membership needs to know it. */
export interface FeedFile {
  addr: string
  /** Unix seconds the file was created — its root's `created_at`, which Ship holds. */
  createdAt: number
}

const NO_MUTES: ReadonlySet<string> = new Set()

/** NIP-78 app data: the kind the mute list is published as. */
const KIND_APP_DATA = 30078

/** The root event of a file as the fold orders it: the address says kind, author and `d`; Ship holds the second. */
function rootOf(file: FeedFile): Pick<SignedEvent, 'id' | 'pubkey' | 'kind' | 'created_at' | 'tags' | 'content'> {
  const [kind, pubkey, ...d] = file.addr.split(':')
  return {
    id: '0'.repeat(64),
    pubkey: pubkey ?? '',
    kind: Number(kind),
    created_at: file.createdAt,
    tags: [['d', d.join(':')]],
    content: '',
  }
}

/**
 * The relay filters one page's facts need, in one request. The stream is asked
 * for by `#A` (a reply drops the lowercase `a`) and by `#a`, because a comment
 * with no `A` anchors every `a` it has (`candidateFilesOf`).
 */
export function feedFactsFilters(file: string, me: string): Record<string, unknown>[] {
  return [
    { kinds: [KIND.CHANGE], '#a': [file] },
    { kinds: [KIND.COMMENT], '#A': [file] },
    { kinds: [KIND.COMMENT], '#a': [file] },
    mutedFilter(me),
  ]
}

/** The newest mute-list event, which is the whole list (§12.3: last write wins). */
function newestMuted(events: readonly SignedEvent[], me: string): SignedEvent | undefined {
  return events
    .filter((e) => e.pubkey === me && e.kind === KIND_APP_DATA && e.tags.some((t) => t[0] === 'd' && t[1] === MUTED_D_TAG))
    .sort((a, b) => b.created_at - a.created_at)[0]
}

/** What the last decrypted mute list said, so an unchanged list costs no `/nip44/decrypt`. */
let mutedCache: { eventId: string; keys: ReadonlySet<string> } | undefined

/** A list that would not decrypt, and when: tried again after {@link MUTED_RETRY_MS}, not on every refresh. */
let mutedFailed: { eventId: string; at: number } | undefined
const MUTED_RETRY_MS = 120_000

/**
 * Each file's roster as last read, so a page opened again draws its members
 * pill at once instead of a couple of seconds later; the read still runs and
 * replaces it. For this tab only: a reload starts empty (Katerina, 2026-10-08).
 */
const rosters = new Map<string, ReadonlyMap<string, Membership>>()

/** Test seam. */
export function resetFeedFactsForTests(): void {
  mutedCache = undefined
  mutedFailed = undefined
  rosters.clear()
}

/**
 * Membership of `file` for `me`, and the keys `me` has muted. `muted` is
 * `undefined` when a list exists and could not be read (the `429` from
 * `/nip44/decrypt` is the usual cause): unreadable is not empty, so the caller
 * keeps what it knew, or holds back its verdict, rather than light a file the
 * person muted.
 *
 * `onMembers` hears the roster as soon as the relay has answered, before the
 * mute list is decrypted: the members pill needs no mutes, so it does not wait
 * for `/nip44/decrypt`.
 */
export async function readFeedFacts(
  query: QueryFn,
  decrypt: (ciphertext: string) => Promise<string | undefined>,
  file: FeedFile,
  me: string,
  onMembers?: (members: ReadonlyMap<string, Membership>) => void,
): Promise<{ membership: Membership; members: ReadonlyMap<string, Membership>; muted: ReadonlySet<string> | undefined }> {
  // The same comment can answer two of the filters; the fold counts events, so each is held once.
  const events = [...new Map((await query(feedFactsFilters(file.addr, me))).map((e) => [e.id, e])).values()]
  const folded = [rootOf(file), ...events]
  const membership = membershipOf(file.addr, me, folded)
  // Everyone's, from the same events: the Members dialog's roster (SHI-31).
  const members = membersOf(file.addr, folded)
  onMembers?.(members)

  const list = newestMuted(events, me)
  if (!list) {
    mutedCache = undefined
    mutedFailed = undefined
    return { membership, members, muted: NO_MUTES }
  }
  if (mutedCache?.eventId !== list.id) {
    if (mutedFailed?.eventId === list.id && Date.now() - mutedFailed.at < MUTED_RETRY_MS) return { membership, members, muted: undefined }
    const parsed = parseMutedBlob((await decrypt(list.content)) ?? '')
    if (!parsed) {
      mutedFailed = { eventId: list.id, at: Date.now() }
      return { membership, members, muted: undefined }
    }
    mutedFailed = undefined
    mutedCache = { eventId: list.id, keys: new Set(parsed.keys) }
  }
  return { membership, members, muted: mutedCache.keys }
}

/** The judges a feed asks `unreadByThread` with: one for the file's stream and one for the record channel's. */
export interface FeedJudges {
  file?: StreamJudge
  channel?: StreamJudge
  /**
   * Who is a member of the file, and since when — from the same read as the
   * judges, but not held back by the mute list, readable or not. A file read
   * before in this tab starts from what that read said; any other is
   * `undefined` until the first read has come back.
   */
  members?: ReadonlyMap<string, Membership>
  /** Read again now — after this page has joined, left or added somebody. */
  reload: () => Promise<void>
}

/**
 * The judges for a page's feed, or none until the facts have been read — an
 * empty answer reads as "nothing is new", the right way to be wrong for a
 * moment, where the alternative flashes a divider onto every thread and takes
 * it away. A failed read keeps the last good facts.
 */
export function useFeedJudges(file: FeedFile | undefined, channel: string | undefined): FeedJudges {
  const addr = file?.addr
  const createdAt = file?.createdAt
  const [facts, setFacts] = useState<{ addr: string; membership: Membership; muted: ReadonlySet<string> }>()
  const [roster, setRoster] = useState<{ addr: string; members: ReadonlyMap<string, Membership> }>()
  /* The file the page is about now: a read for the one it just left must not replace the new one's facts. */
  const current = useRef(addr)
  useEffect(() => {
    current.current = addr
  }, [addr])

  const load = useCallback(async () => {
    if (addr === undefined || createdAt === undefined || !signedIn()) return
    try {
      const read = await readFeedFacts((filters) => relay.queryAll(filters), (c) => nip44.decrypt(c), { addr, createdAt }, signer.pubkey, (members) => {
        rosters.set(addr, members)
        if (current.current === addr) setRoster({ addr, members })
      })
      if (current.current !== addr) return
      const { muted } = read
      // An unreadable mute list keeps the mutes this file was last judged with, and with none yet the page holds back its verdict.
      setFacts((held) => {
        const kept = held?.addr === addr ? held.muted : undefined
        const known = muted ?? kept
        return known ? { addr, membership: read.membership, muted: known } : held
      })
    } catch (error) {
      console.warn('[unread] could not read membership:', error)
    }
  }, [addr, createdAt])

  useEffect(() => {
    void load()
  }, [load])
  useRefresh(load, { intervalMs: FEED_FACTS_REFRESH_MS })

  return useMemo(() => {
    const members = roster && roster.addr === addr ? roster.members : addr === undefined ? undefined : rosters.get(addr)
    if (!facts || facts.addr !== addr) return { members, reload: load }
    const me = signer.pubkey
    return {
      file: { stream: facts.addr, me, member: facts.membership.member, since: facts.membership.since, muted: facts.muted.has(facts.addr) },
      channel: channel
        ? { stream: channel, me, member: false, muted: facts.muted.has(channel), floor: Number.MAX_SAFE_INTEGER }
        : undefined,
      members,
      reload: load,
    }
  }, [facts, roster, addr, channel, load])
}
