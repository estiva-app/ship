/**
 * Who a topic lists, read where topics are kept in order (ALL-6): its first record and each field's current change —
 * every person's current level and membership among them — by the list read, and none of the topic's other changes.
 * Asserted on what the relay is asked, and on the count Explore draws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLevelChange } from '@estiva-app/conversation'
import type { SignedEvent } from '@estiva-app/protocol'

const SHIP = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const TEAM = '05bebd5b-b699-4bd4-af50-f5377df0fd67'
const TOPIC = `30840:${SHIP}:topic-1`

let seq = 0
const signed = (event: Omit<SignedEvent, 'id' | 'sig'>): SignedEvent => ({ ...event, id: (++seq).toString(16).padStart(64, '0'), sig: '' })
const root = signed({ pubkey: SHIP, created_at: 1_700_000_000, kind: 30840, tags: [['d', 'topic-1'], ['h', TEAM], ['title', 'Topic']], content: '' })
const follows = signed(buildLevelChange(ADA, 1_700_000_100_000, { place: TOPIC, folder: TEAM, level: 'all' }))
const renamed = signed({ pubkey: SHIP, created_at: 1_700_000_200, kind: 1851, tags: [['a', TOPIC], ['field', 'title'], ['value', 'Topic, renamed'], ['h', TEAM]], content: '' })

const state = vi.hoisted(() => ({ asked: [] as Record<string, unknown>[], switched: false }))
/** A relay answering a list read with the record and each field's current change, and a plain read by its filters. */
const answer = (filters: Record<string, unknown>[]): SignedEvent[] => {
  state.asked.push(...filters)
  const out = new Set<SignedEvent>()
  for (const filter of filters) {
    const kinds = filter.kinds as number[]
    if (filter.fields) {
      if (kinds.includes(30840)) [root, follows, renamed].forEach((e) => out.add(e))
    } else if (kinds.includes(1851) && (filter['#a'] as string[] | undefined)?.includes(TOPIC)) [follows, renamed].forEach((e) => out.add(e))
    else if (kinds.includes(30840)) out.add(root)
  }
  return [...out]
}
vi.mock('./store', () => ({
  relay: { query: async (filters: Record<string, unknown>[]) => answer(filters), queryAll: async (filters: Record<string, unknown>[]) => answer(filters) },
  signer: { pubkey: 'c'.repeat(64) },
  topicFieldsNow: async () => (state.switched ? { text: true } : undefined),
}))

import { readTopicMembers, readTopicPlace } from './foreign'

/** A filter asking for every change of the topic: no list read, not narrowed to a person. */
const everyChange = (filter: Record<string, unknown>) =>
  (filter.kinds as number[]).includes(1851) && !filter.fields && !filter['#p'] && ((filter['#a'] as string[] | undefined) ?? []).includes(TOPIC)

const topic = { address: TOPIC, folder: TEAM } as Parameters<typeof readTopicMembers>[0][number]

beforeEach(() => {
  state.asked = []
  state.switched = false
})

describe('who a topic lists, where topics are kept in order (ALL-6)', () => {
  it('counts the same people by the list read, and asks for none of the topic’s every change', async () => {
    const before = await readTopicMembers([topic])
    expect(state.asked.some(everyChange)).toBe(true)
    state.asked = []
    state.switched = true
    const after = await readTopicMembers([topic])
    expect(after.get(TOPIC)).toBe(before.get(TOPIC))
    expect(after.get(TOPIC)).toBe(2)
    expect(state.asked.some(everyChange)).toBe(false)
    expect(state.asked.some((filter) => filter.fields && (filter['#d'] as string[]).includes('topic-1'))).toBe(true)
  })

  it('a topic’s page lists the people who chose a level, from the list read', async () => {
    state.switched = true
    const place = await readTopicPlace({ address: TOPIC, folder: TEAM })
    expect(place.listed.map((one) => one.pubkey).sort()).toEqual([ADA, SHIP].sort())
    expect(state.asked.some(everyChange)).toBe(false)
  })
})
