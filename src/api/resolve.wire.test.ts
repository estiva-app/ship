/**
 * Resolving and reopening a thread from Ship (ONE-8, SPEC §6.4), at the wire: the `kind:9101` Ship signs, in the
 * comment's own team, with the note as its content, and what the shared fold — the one Peek and Leaf read by — makes
 * of it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent, UnsignedEvent } from '@estiva-app/protocol'
import { foldThreads } from '@estiva-app/conversation'

const PK = 'ab'.repeat(32)
const ANA = 'cd'.repeat(32)
const COMMENT_TEAM = '3167adea-877f-43c4-96fb-517a2b2d5d24'
const COMMENT = 'c'.repeat(64)
let count = 0
const sent: SignedEvent[] = []

vi.mock('./store', async () => {
  const { Store } = await import('../nostr/store')
  const signer = {
    pubkey: PK,
    sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: (++count).toString(16).padStart(64, '0'), sig: '0'.repeat(128) }),
  }
  const relay = {
    query: async () => [],
    queryAll: async () => [],
    publish: async (event: SignedEvent) => {
      sent.push(event)
      return { ok: true }
    },
  }
  return { relay, signer, store: new Store(relay as never, signer as never, async () => 0) }
})
vi.mock('./clock', () => ({ clockProblem: async () => undefined }))

const { resolveThread } = await import('./writes')

const tag = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const comment = { id: COMMENT, kind: 1111, pubkey: ANA, created_at: 1_790_000_000, content: 'Is this ready?', sig: '0'.repeat(128), tags: [['h', COMMENT_TEAM], ['A', `30851:${ANA}:issue`]] } as SignedEvent

beforeEach(() => {
  sent.length = 0
})

describe("Ship's resolve, at the wire", () => {
  it('signs a 9101 about the comment, in its team, with the note, and the shared fold reads it resolved by Ship', async () => {
    const result = await resolveThread({ folder: COMMENT_TEAM, threadId: COMMENT, resolved: true, note: '  Shipped in #12  ' })
    expect(result.ok).toBe(true)
    const [event] = sent
    expect(event.kind).toBe(9101)
    expect(tag(event, 'h')).toBe(COMMENT_TEAM)
    expect(tag(event, 'e')).toBe(COMMENT)
    expect(tag(event, 't')).toBe('resolution')
    expect(tag(event, 'action')).toBe('resolved')
    expect(event.content).toBe('Shipped in #12')
    const [thread] = foldThreads([comment, event], { viewer: ANA })
    expect(thread.resolution).toMatchObject({ action: 'resolved', by: PK, message: 'Shipped in #12' })
  })

  it('reopens with a 9101 that carries no note, and the newest one counts', async () => {
    await resolveThread({ folder: COMMENT_TEAM, threadId: COMMENT, resolved: true, note: 'Done' })
    await resolveThread({ folder: COMMENT_TEAM, threadId: COMMENT, resolved: false, note: 'ignored' })
    const reopen = sent[1]
    expect(tag(reopen, 'action')).toBe('reopened')
    expect(tag(reopen, 'h')).toBe(COMMENT_TEAM)
    expect(reopen.content).toBe('')
    const [thread] = foldThreads([comment, ...sent], { viewer: ANA })
    expect(thread.resolution?.action).toBe('reopened')
  })
})
