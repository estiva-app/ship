/**
 * What Ship reads of a conversation for the one conversation's cards (ONE-6, step 2): a thread whose comment was
 * deleted says so, and a comment written on a selection in Leaf keeps the words it quotes. Nothing here is drawn yet.
 */
import { describe, expect, it } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'
import { foldFolder } from './fold'

const ISSUE = '30851:' + 'a'.repeat(64) + ':issue-1'
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)

const event = (e: Partial<SignedEvent> & Pick<SignedEvent, 'id' | 'kind' | 'tags'>): SignedEvent =>
  ({ pubkey: ANA, created_at: 1_790_000_000, content: '', sig: '0'.repeat(128), ...e }) as SignedEvent

const comment = (id: string, at: number, extra: string[][] = []) => event({ id, kind: 1111, created_at: at, tags: [['A', ISSUE], ['K', '30851'], ['h', 'f'], ...extra], content: id })
const replyTo = (parent: string, id: string, at: number) =>
  event({ id, kind: 1111, pubkey: RAVI, created_at: at, tags: [['A', ISSUE], ['K', '30851'], ['e', parent], ['k', '1111'], ['h', 'f']], content: id })

describe('a thread whose comment was deleted', () => {
  it('says its comment is missing, and keeps every reply in order', () => {
    const { conversations } = foldFolder([replyTo('gone', 'r2', 20), replyTo('gone', 'r1', 10)])
    expect(conversations).toHaveLength(1)
    expect(conversations[0]).toMatchObject({ id: 'gone', rootMissing: true })
    // The earliest reply stands in for it, as before, so nothing drawn today moves.
    expect([conversations[0]!.root.id, ...conversations[0]!.replies.map((r) => r.id)]).toEqual(['r1', 'r2'])
  })

  it('a thread whose comment is there says nothing of the kind', () => {
    const { conversations } = foldFolder([comment('c1', 5), replyTo('c1', 'r1', 10)])
    expect(conversations[0]!.root.id).toBe('c1')
    expect(conversations[0]!.rootMissing).toBeUndefined()
  })
})

describe('a comment written on a selection (Leaf, LEAF-7)', () => {
  it('keeps the words it quotes, start and end', () => {
    const { conversations } = foldFolder([comment('c1', 5, [['quote', 'The board loses', 'its order']])])
    expect(conversations[0]!.root.quote).toEqual({ start: 'The board loses', end: 'its order' })
  })

  it('one on whole blocks or the whole file quotes nothing', () => {
    const { conversations } = foldFolder([comment('c1', 5)])
    expect(conversations[0]!.root.quote).toBeUndefined()
  })
})
