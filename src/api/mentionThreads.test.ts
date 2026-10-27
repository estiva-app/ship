// @vitest-environment jsdom
/**
 * Mentioned in reads across the relay (PEEKM-7): a Peek topic message that
 * links an issue sits in a Folder Ship never loads, so the issue's Activity
 * asks the relay for every message pointing at it and the thread each sits in.
 * The relay here answers NIP-01 filters over a fixed set of events.
 */
import { addrToNaddr, type Relay, type SignedEvent } from '@estiva-app/protocol'
import { describe, expect, it } from 'vitest'
import type { DirectoryView } from '@/api'
import { activityFor } from '../pages/ProjectPage'
import { foldWorkspace, Store } from '../nostr/store'
import type { Signer } from '../nostr/signer'

const FOLDER = 'ffffffff-0000-0000-0000-000000000000'
const TOPIC = '70000000-0000-0000-0000-000000000000'
const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const AUTHOR = 'b'.repeat(64)

let seq = 0
const event = (id: string, kind: number, folder: string, tags: string[][], content: string): SignedEvent =>
  ({ id, pubkey: AUTHOR, created_at: 1_700_000_000 + ++seq, kind, tags: [['h', folder], ...tags], content, sig: 'x'.repeat(128) }) as SignedEvent

type Filter = Record<string, unknown>
const matches = (e: SignedEvent, filter: Filter) =>
  Object.entries(filter).every(([key, want]) => {
    if (key === 'limit') return true
    const values = want as unknown[]
    if (key === 'kinds') return values.includes(e.kind)
    if (key === 'ids') return values.includes(e.id)
    if (key.startsWith('#')) return e.tags.some((t) => t[0] === key.slice(1) && values.includes(t[1]))
    return false
  })

function relayOver(events: SignedEvent[], refuse = false) {
  const asked: Filter[][] = []
  const query = (filters: Filter[]) => {
    asked.push(filters)
    if (refuse) return Promise.reject(new Error('restricted: rate-limited'))
    return Promise.resolve(events.filter((e) => filters.some((f) => matches(e, f))))
  }
  return { relay: { query, queryAll: query } as unknown as Relay, asked }
}

const directory = {
  directory: {},
  nameOf: (pubkey: string) => pubkey.slice(0, 8),
  personOf: (pubkey: string) => ({ name: pubkey.slice(0, 8) }),
  profileOf: () => undefined,
} as unknown as DirectoryView

describe('a Peek thread that links the issue, in a topic Ship does not load (PEEKM-7)', () => {
  const root = event('1'.repeat(64), 9, TOPIC, [], 'Planning the launch')
  const mention = event('2'.repeat(64), 9, TOPIC, [['e', root.id, '', 'root'], ['a', ISSUE]], `Blocked on nostr:${addrToNaddr(ISSUE)}`)
  const reply = event('3'.repeat(64), 9, TOPIC, [['e', root.id, '', 'root'], ['e', mention.id, '', 'reply']], 'Agreed')
  const replyEdit = event('4'.repeat(64), 40003, TOPIC, [['e', reply.id]], 'Agreed, after Friday')
  const unrelated = event('5'.repeat(64), 9, TOPIC, [], 'Lunch?')
  const state = foldWorkspace({ events: [], folders: [FOLDER] })
  const store = (relay: Relay) => new Store(relay, {} as Signer)

  it("reads the mention's whole thread, its replies' edits included, and nothing else in the topic", async () => {
    const { relay } = relayOver([root, mention, reply, replyEdit, unrelated])
    const read = await store(relay).mentionThreads(ISSUE, state.folders)
    expect(read.map((e) => e.id).sort()).toEqual([root.id, mention.id, reply.id, replyEdit.id].sort())
  })

  it('draws it in the issue’s Activity as one thread, its reply as edited', async () => {
    const { relay } = relayOver([root, mention, reply, replyEdit, unrelated])
    const read = await store(relay).mentionThreads(ISSUE, state.folders)
    const { items } = activityFor(ISSUE, state, directory, undefined, () => undefined, () => false, read)
    expect(items.map((i) => i.thread.id)).toEqual([root.id])
    expect(JSON.stringify(items[0].thread)).toContain('Agreed, after Friday')
  })

  it('reads no thread for a mention in a Folder the workspace already holds', async () => {
    const own = event('6'.repeat(64), 1111, FOLDER, [['a', ISSUE]], `See nostr:${addrToNaddr(ISSUE)}`)
    const { relay, asked } = relayOver([own])
    await store(relay).mentionThreads(ISSUE, [FOLDER])
    expect(asked.flat().some((f) => 'ids' in f || '#E' in f)).toBe(false)
  })

  it('throws on a refused read, so the page keeps what it held', async () => {
    const { relay } = relayOver([mention], true)
    await expect(store(relay).mentionThreads(ISSUE, state.folders)).rejects.toThrow()
  })
})
