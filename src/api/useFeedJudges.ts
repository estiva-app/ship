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
 * ## The channel is not folded
 *
 * A Folder's general stream takes its members from the roster, which is the
 * relay's. A project page draws its record channel's chat only for somebody who
 * can read that Folder, so the reader is judged a member of it. The roster
 * carries no join time, so without a marker nothing in the channel counts
 * (`floor` beyond every `created_at`) — the quiet first run this feed has
 * always had; a message that names you still counts, and the page's marker
 * takes over after the first visit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MUTED_D_TAG,
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

/** The relay filters one page's facts need, in one request. */
export function feedFactsFilters(file: string, me: string): Record<string, unknown>[] {
  return [{ kinds: [KIND.CHANGE], '#a': [file] }, { kinds: [KIND.COMMENT], '#A': [file] }, mutedFilter(me)]
}

/** The newest mute-list event, which is the whole list (§12.3: last write wins). */
function newestMuted(events: readonly SignedEvent[], me: string): SignedEvent | undefined {
  return events
    .filter((e) => e.pubkey === me && e.kind === KIND_APP_DATA && e.tags.some((t) => t[0] === 'd' && t[1] === MUTED_D_TAG))
    .sort((a, b) => b.created_at - a.created_at)[0]
}

/** What the last decrypted mute list said, so an unchanged list costs no `/nip44/decrypt`. */
let mutedCache: { eventId: string; keys: ReadonlySet<string> } | undefined

/** Test seam. */
export function resetFeedFactsForTests(): void {
  mutedCache = undefined
}

/**
 * Membership of `file` for `me`, and the keys `me` has muted. A mute list that
 * will not decrypt mutes nothing: quiet is the wrong way to be wrong only for a
 * person who asked for it, and nothing here says they did.
 */
export async function readFeedFacts(
  query: QueryFn,
  decrypt: (ciphertext: string) => Promise<string | undefined>,
  file: FeedFile,
  me: string,
): Promise<{ membership: Membership; muted: ReadonlySet<string> }> {
  const events = await query(feedFactsFilters(file.addr, me))
  const membership = membershipOf(file.addr, me, [rootOf(file), ...events])

  const list = newestMuted(events, me)
  if (!list) {
    mutedCache = undefined
    return { membership, muted: NO_MUTES }
  }
  if (mutedCache?.eventId !== list.id) {
    const parsed = parseMutedBlob((await decrypt(list.content)) ?? '')
    if (!parsed) return { membership, muted: mutedCache?.keys ?? NO_MUTES }
    mutedCache = { eventId: list.id, keys: new Set(parsed.keys) }
  }
  return { membership, muted: mutedCache.keys }
}

/** The judges a feed asks `firstUnreadByThread` with: one for the file's stream and one for the record channel's. */
export interface FeedJudges {
  file?: StreamJudge
  channel?: StreamJudge
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

  const load = useCallback(async () => {
    if (addr === undefined || createdAt === undefined || !signedIn()) return
    try {
      const read = await readFeedFacts((filters) => relay.queryAll(filters), (c) => nip44.decrypt(c), { addr, createdAt }, signer.pubkey)
      setFacts({ addr, ...read })
    } catch (error) {
      console.warn('[unread] could not read membership:', error)
    }
  }, [addr, createdAt])

  useEffect(() => {
    void load()
  }, [load])
  useRefresh(load, { intervalMs: FEED_FACTS_REFRESH_MS })

  return useMemo(() => {
    if (!facts || facts.addr !== addr) return {}
    const me = signer.pubkey
    return {
      file: { stream: facts.addr, me, member: facts.membership.member, since: facts.membership.since, muted: facts.muted.has(facts.addr) },
      channel: channel
        ? { stream: channel, me, member: true, muted: facts.muted.has(channel), floor: Number.MAX_SAFE_INTEGER }
        : undefined,
    }
  }, [facts, addr, channel])
}
