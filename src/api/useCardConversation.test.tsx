/**
 * A card's comment count, and its unread dot — WBM-5. The dot is only for a
 * member of the file, or for a message that names the reader (SPEC §11.8;
 * record membership-replaces-following, Decided 16 Oct); the count is the
 * file's, whoever reads it. Judged against the file's own marker, as the
 * Activity tab is, so reading it in either app puts the dot out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

const { READER, events, merged } = vi.hoisted(() => ({
  READER: 'f3a38fa6c6a1e5d2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081920',
  events: { list: [] as unknown[] },
  merged: { value: {} as Record<string, number> },
}))
vi.mock('./store', () => ({ relay: { queryAll: async () => events.list }, signer: { pubkey: READER } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))
vi.mock('./nip44', () => ({ nip44: { decrypt: async () => undefined } }))
vi.mock('./readStateSync', () => ({ useMergedReadState: () => merged.value }))

import { resetCardConversationsForTests, useCardConversation } from './useCardConversation'
import { resetFeedFactsForTests } from './useFeedJudges'

const SHIP = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const ISSUE = `30851:${SHIP}:c0b27d90-d5b9-40e7-8078-865ab36a421c`

let seq = 0
/** A comment on the issue, top-level unless it answers `root`. */
const comment = (by: string, at: number, root?: string): SignedEvent => ({
  id: String(++seq).padStart(64, '0'),
  sig: '',
  pubkey: by,
  created_at: at,
  kind: 1111,
  tags: root
    ? [['A', ISSUE], ['K', '30851'], ['P', SHIP], ['e', root], ['k', '1111'], ['p', READER]]
    : [['A', ISSUE], ['a', ISSUE], ['K', '30851'], ['k', '30851'], ['P', SHIP], ['p', SHIP]],
  content: 'a remark',
})

beforeEach(() => {
  resetCardConversationsForTests()
  resetFeedFactsForTests()
  merged.value = {}
})

describe('a card’s comment count', () => {
  it('counts the conversations, not their replies, and lights the dot for a member with something unread', async () => {
    const mine = comment(READER, 1_800_000_000)
    events.list = [mine, comment(ADA, 1_800_000_100), comment(ADA, 1_800_000_200, mine.id)]
    const { result } = renderHook(() => useCardConversation(ISSUE))
    await waitFor(() => expect(result.current).toEqual({ count: 2, unread: true }))
  })

  it('shows the count with no dot to a reader who is no member of the file', async () => {
    events.list = [comment(ADA, 1_800_000_000), comment(ADA, 1_800_000_100)]
    const { result } = renderHook(() => useCardConversation(ISSUE))
    await waitFor(() => expect(result.current).toEqual({ count: 2, unread: false }))
  })

  it('puts the dot out once the file’s conversation was read past its last message', async () => {
    events.list = [comment(READER, 1_800_000_000), comment(ADA, 1_800_000_100)]
    merged.value = { [ISSUE]: 1_800_000_150 }
    const { result } = renderHook(() => useCardConversation(ISSUE))
    await waitFor(() => expect(result.current).toEqual({ count: 2, unread: false }))
  })

  it('leaves the dot out for the file’s creator for what was said before the read-state horizon', async () => {
    const mine = `30851:${READER}:d0b27d90-d5b9-40e7-8078-865ab36a421c`
    const long = Math.floor(Date.now() / 1000) - 120 * 24 * 60 * 60
    events.list = [{ ...comment(ADA, long), tags: [['A', mine], ['a', mine], ['K', '30851'], ['k', '30851'], ['P', READER], ['p', READER]] }]
    const { result } = renderHook(() => useCardConversation(mine))
    await waitFor(() => expect(result.current).toEqual({ count: 1, unread: false }))
  })

  it('asks nothing for a card with no conversation of its own', () => {
    const { result } = renderHook(() => useCardConversation(undefined))
    expect(result.current).toBeUndefined()
  })
})
