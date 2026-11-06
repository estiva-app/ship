/**
 * What Ship reads about a page's threads, through the one shared fold (ONE-6, step 2; ONE-9): resolves made in Peek or
 * Leaf (Katerina, 2 November: Ship shows them and writes none), a comment's deletion by its author, and reactions by
 * person. Asserted on what the relay answers: `kind:9101`, `kind:5` and `kind:7` events, read by `#e`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'

/** What the relay holds; it answers each query with what the filters ask for by kind and `#e`. */
let held: SignedEvent[] = []
let asked: Record<string, unknown>[][] = []
const answer = (filters: Record<string, unknown>[]) => {
  asked.push(filters)
  return held.filter((event) =>
    filters.some((f) => (f.kinds as number[] | undefined)?.includes(event.kind) && (f['#e'] as string[] | undefined)?.some((id) => event.tags.some((t) => t[0] === 'e' && t[1] === id))),
  )
}

vi.mock('./store', async () => {
  const { Store } = await import('../nostr/store')
  const signer = { pubkey: 'c'.repeat(64) }
  const relay = { query: async (filters: Record<string, unknown>[]) => answer(filters) }
  return { relay, signer, store: new Store(relay as never, signer as never) }
})

const { threadsOn } = await import('./index')

const ISSUE = '30851:' + 'a'.repeat(64) + ':issue-1'
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const PEEK_USER = 'e'.repeat(64)
const COMMENT = 'd'.repeat(64)
const REPLY = '9'.repeat(64)

const signed = (e: Pick<SignedEvent, 'id' | 'kind' | 'pubkey' | 'created_at' | 'tags'> & { content?: string }): SignedEvent => ({ content: '', sig: '0'.repeat(128), ...e }) as SignedEvent
const comment = signed({ id: COMMENT, kind: 1111, pubkey: ANA, created_at: 50, tags: [['A', ISSUE], ['K', '30851'], ['h', 'f']] })
const reply = signed({ id: REPLY, kind: 1111, pubkey: RAVI, created_at: 60, tags: [['A', ISSUE], ['K', '30851'], ['e', COMMENT], ['k', '1111'], ['p', ANA], ['h', 'f']] })
const assertion = (id: string, action: 'resolved' | 'reopened', at: number, content = '') =>
  signed({ id, kind: 9101, pubkey: PEEK_USER, created_at: at, content, tags: [['e', COMMENT], ['t', 'resolution'], ['action', action], ['h', 'f']] })
const deletion = (by: string) => signed({ id: '5'.repeat(64), kind: 5, pubkey: by, created_at: 300, tags: [['e', COMMENT], ['k', '1111']] })
const reaction = (id: string, by: string) => signed({ id, kind: 7, pubkey: by, created_at: 70, content: '👍', tags: [['e', REPLY], ['p', RAVI], ['k', '1111']] })

const present = { id: COMMENT, gone: false, messages: [{ id: COMMENT, at: 50, event: comment }, { id: REPLY, at: 60, event: reply }] }
// Its comment was not in the workspace read: only the reply came back.
const goneThread = { id: COMMENT, gone: true, messages: [{ id: REPLY, at: 60, event: reply }] }

beforeEach(() => {
  held = []
  asked = []
})

describe('a resolve made in Peek or Leaf', () => {
  it('is read with who resolved it, when, and the note they wrote', async () => {
    held = [assertion('1'.repeat(64), 'resolved', 100, 'Keeping the first one.')]
    const { resolved } = await threadsOn([present])
    expect(resolved[COMMENT]).toMatchObject({ action: 'resolved', by: PEEK_USER, at: 100, message: 'Keeping the first one.' })
  })

  it('reopened since, it no longer stands resolved', async () => {
    held = [assertion('1'.repeat(64), 'resolved', 100), assertion('2'.repeat(64), 'reopened', 200)]
    const { resolved } = await threadsOn([present])
    expect(resolved[COMMENT]).toBeUndefined()
  })
})

describe('a thread whose comment was not read', () => {
  it('is deleted when its author’s deletion is on the relay, and stays resolved', async () => {
    held = [assertion('1'.repeat(64), 'resolved', 100, 'Done.'), deletion(ANA)]
    const { gone, resolved } = await threadsOn([goneThread])
    expect(gone[COMMENT]).toBe('deleted')
    expect(resolved[COMMENT]).toMatchObject({ action: 'resolved', message: 'Done.' })
  })

  it('cannot be shown when no deletion by its author is on the relay', async () => {
    held = [deletion(PEEK_USER)]
    const { gone } = await threadsOn([goneThread])
    expect(gone[COMMENT]).toBe('missing')
  })

  it('asks for a deletion only when a thread’s comment was not read', async () => {
    await threadsOn([present])
    expect(asked.flat().some((f) => (f.kinds as number[]).includes(5))).toBe(false)
  })
})

describe('reactions', () => {
  it('count each person once, known by their key', async () => {
    held = [reaction('1'.repeat(64), ANA), reaction('2'.repeat(64), PEEK_USER)]
    const { reactions } = await threadsOn([present])
    expect(reactions[REPLY]).toEqual([expect.objectContaining({ emoji: '👍', count: 2, by: [ANA, PEEK_USER] })])
  })
})
