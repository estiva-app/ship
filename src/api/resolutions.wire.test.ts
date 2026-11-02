/**
 * Resolves made in Peek or Leaf, read by Ship (ONE-6, step 2; Katerina, 2 November: Ship shows them and writes none).
 * Asserted on what the relay answers: `kind:9101` assertions on a comment, the last one saying its state, as Peek reads them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'

/** What the relay holds; it answers each query with what the filters ask for by kind and `#e`. */
let held: SignedEvent[] = []
const answer = (filters: Record<string, unknown>[]) => {
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

const { reactionsOn } = await import('./index')

const COMMENT = 'd'.repeat(64)
const OTHER = 'e'.repeat(64)
const PEEK_USER = 'a'.repeat(64)

const assertion = (id: string, target: string, action: 'resolved' | 'reopened', at: number, content = ''): SignedEvent =>
  ({ id, kind: 9101, pubkey: PEEK_USER, created_at: at, content, sig: '0'.repeat(128), tags: [['e', target], ['t', 'resolution'], ['action', action]] }) as SignedEvent

beforeEach(() => {
  held = []
})

describe('a resolve made in Peek or Leaf', () => {
  it('is read with who resolved it, when, and the note they wrote', async () => {
    held = [assertion('1'.repeat(64), COMMENT, 'resolved', 100, 'Keeping the first one.')]
    const { resolved } = await reactionsOn([{ id: COMMENT, at: 50 }, { id: OTHER, at: 60 }])
    expect(resolved?.[COMMENT]).toMatchObject({ action: 'resolved', by: PEEK_USER, at: 100, message: 'Keeping the first one.' })
    expect(resolved?.[OTHER]).toBeUndefined()
  })

  it('reopened since, it no longer stands resolved', async () => {
    held = [assertion('1'.repeat(64), COMMENT, 'resolved', 100), assertion('2'.repeat(64), COMMENT, 'reopened', 200)]
    const { resolved } = await reactionsOn([{ id: COMMENT, at: 50 }])
    expect(resolved?.[COMMENT]).toBeUndefined()
  })
})
