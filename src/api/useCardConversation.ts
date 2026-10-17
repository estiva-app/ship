import { useCallback, useEffect, useMemo, useState } from 'react'
import { READ_STATE_HORIZON_DAYS, THREAD_RULE_FROM, isReply, streamOf, unreadIn, type Membership } from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'
import { useRefresh } from '@/lib/useRefresh'
import { signedIn } from '../auth/estivaId'
import { nip44 } from './nip44'
import { useMergedReadState } from './readStateSync'
import { relay, signer } from './store'
import { readFeedFacts } from './useFeedJudges'

/**
 * How long a card's answer is trusted without asking again: the cadence the
 * page's own membership and read state are re-read at (`useFeedJudges`), so a
 * comment said meanwhile reaches the card's count and dot as it reaches the page.
 */
const HELD_MS = 30_000

/** No marker within the read-state horizon is not "never read": only what was said inside it counts (§11.6, Peek's rule). */
const HORIZON_SECONDS = READ_STATE_HORIZON_DAYS * 24 * 60 * 60

interface Facts {
  at: number
  /** The file's stream: its comments and the replies in their threads. */
  stream: readonly SignedEvent[]
  membership: Membership
  muted: boolean
}

/** Each carded file's last answer, for this tab: a conversation of carded comments is one read per file, not one per card. */
const held = new Map<string, Facts>()
const asking = new Map<string, Promise<Facts | undefined>>()

function ask(address: string): Promise<Facts | undefined> {
  const flight = asking.get(address)
  if (flight) return flight
  // The file's root is not in hand: a creator counts as a member from the start, which a marker then bounds.
  const next = readFeedFacts((filters) => relay.queryAll(filters), (c) => nip44.decrypt(c), { addr: address, createdAt: 0 }, signer.pubkey)
    .then(({ events, membership, muted }) => {
      // An unreadable mute list keeps what was known; with nothing known the card shows no dot rather than light a muted file.
      const before = held.get(address)
      if (!muted && !before) return undefined
      const facts = { at: Date.now(), stream: streamOf(address, events), membership, muted: muted ? muted.has(address) : before!.muted }
      held.set(address, facts)
      return facts
    })
    // A failed read costs the badge, never the card.
    .catch(() => held.get(address))
    .finally(() => asking.delete(address))
  asking.set(address, next)
  return next
}

/** Test seam. */
export function resetCardConversationsForTests(): void {
  held.clear()
  asking.clear()
}

/**
 * What was said about a carded file: how many conversations, and whether one
 * holds something this reader has not read — only for a member, or a message
 * naming them (SPEC §11.8; record membership-replaces-following), judged against the file's own marker
 * as Ship's Activity tab judges it, so the dot goes out when either app reads
 * it. `undefined` until asked, signed out, or for an address with no
 * conversation of its own.
 */
export function useCardConversation(address: string | undefined): { count: number; unread: boolean } | undefined {
  const [facts, setFacts] = useState<Facts | undefined>(() => (address ? held.get(address) : undefined))
  const merged = useMergedReadState()
  const load = useCallback(() => {
    if (!address || !signedIn()) return
    const now = held.get(address)
    if (now && Date.now() - now.at < HELD_MS) return
    void ask(address).then((next) => {
      if (next) setFacts((shown) => (shown === next ? shown : next))
    })
  }, [address])
  useEffect(() => {
    setFacts(address ? held.get(address) : undefined)
    load()
  }, [address, load])
  useRefresh(load, { intervalMs: HELD_MS })
  return useMemo(() => {
    if (!address || !facts) return undefined
    const count = facts.stream.filter((event) => !isReply(event)).length
    // A reply from before the thread rule's cut-over never lit a row, and stays dark (CON-34, as Peek's cards).
    const judged = facts.stream.filter((event) => !isReply(event) || event.created_at >= THREAD_RULE_FROM)
    // Peek's rule for files: a member's unread, or a message that names the reader (§11.8).
    const floor = Math.floor(Date.now() / 1000) - HORIZON_SECONDS
    // The root is not in hand, so a creator's `since` is 0: the horizon bounds what counts for them.
    const since = Math.max(facts.membership.since ?? 0, floor)
    const unread = unreadIn(judged, merged, { stream: address, me: signer.pubkey, member: facts.membership.member, since, muted: facts.muted, floor }).length > 0
    return { count, unread }
  }, [address, facts, merged])
}
