/**
 * A row Activity read from a Folder Ship does not load — a Peek topic message,
 * a Leaf comment on a document (PEEKM-7) — is edited and answered in its own
 * Folder, asserted on the signed event that would reach the relay. The relay
 * is stubbed at the API's `store` and the manifests at `handoff`; the writes,
 * the fold beside the workspace and the `Store` that signs are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addrToNaddr, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'

const PK = 'b'.repeat(64)

const wire = vi.hoisted(() => ({ store: undefined as unknown as Record<'postMessage' | 'editMessage', (args: unknown) => unknown>, sent: [] as SignedEvent[] }))
vi.mock('@/api/store', () => ({
  store: {
    postMessage: (args: unknown) => wire.store.postMessage(args),
    editMessage: (args: unknown) => wire.store.editMessage(args),
  },
  relay: { query: async () => [] },
  signer: { pubkey: 'b'.repeat(64) },
}))
vi.mock('@/api/handoff', () => ({ declaredManifests: async () => [] }))
vi.mock('@/api/clock', () => ({ clockProblem: async () => null }))
vi.mock('@/api/foreign', async (original) => ({ ...(await original<object>()), readFolders: vi.fn(), readFolderListing: vi.fn(), loadQuery: () => async () => [] }))

import { Store, foldWorkspace } from '../nostr/store'
import type { Signer } from '../nostr/signer'
import { editMessage, reply } from '@/api/writes'
import { cardEditOf, folderOfMessage, withElsewhere } from './ProjectPage'

const FOLDER = 'ffffffff-0000-4000-8000-000000000000'
const TOPIC = '70000000-0000-4000-8000-000000000000'
const DOC_FOLDER = 'd0000000-0000-4000-8000-000000000000'
const DOC = `30842:${'d'.repeat(64)}:a-document`
const ISSUE = `30851:${PK}:the-issue`
const ref = `nostr:${addrToNaddr(ISSUE)}`
const at = (folder: string, id: string, kind: number, tags: string[][], content: string) =>
  ({ id, pubkey: PK, created_at: 1_700_000_000, kind, tags: [['h', folder], ...tags], content, sig: 'x'.repeat(128) }) as SignedEvent
const peek = at(TOPIC, '9'.repeat(64), 9, [['a', ISSUE]], `Look at ${ref}`)
const leaf = at(DOC_FOLDER, '7'.repeat(64), 1111, [['A', DOC], ['a', DOC], ['K', '30842'], ['a', ISSUE]], `Tracked in ${ref}`)
// Ship loaded only the issue's own Folder.
const acting = withElsewhere(foldWorkspace({ events: [], folders: [FOLDER] }), [peek, leaf])
const values = (event: { tags: string[][] }, name: string) => event.tags.filter((t) => t[0] === name).map((t) => t[1])

beforeEach(() => {
  vi.useFakeTimers()
  wire.sent = []
  const relay = { publish: async (event: SignedEvent) => (wire.sent.push(event), { ok: true }) } as unknown as Relay
  const signer = { pubkey: PK, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'e'.repeat(64), sig: '0'.repeat(128) }) } as unknown as Signer
  wire.store = new Store(relay, signer) as unknown as typeof wire.store
})

afterEach(() => vi.useRealTimers())

describe("Activity's rows from elsewhere are written to in their own Folder (PEEKM-7)", () => {
  it('an edit of a listed Peek topic message goes out into the topic, naming the message', async () => {
    const folder = folderOfMessage(acting, peek.id)
    expect(folder).toBeDefined()
    expect(await editMessage(folder!, peek.id, `Look again at ${ref}`, cardEditOf(acting, peek.id), [])).toEqual({ ok: true })
    const [edit] = wire.sent
    expect(edit.kind).toBe(40003)
    expect(values(edit, 'h')).toEqual([TOPIC])
    expect(values(edit, 'e')).toContain(peek.id)
  })

  it('a reply to a listed Leaf comment goes out on its document, in its Folder, answering it', async () => {
    const thread = acting.conversations.find((c) => c.id === leaf.id)!
    expect(await reply(thread, FOLDER, 'Agreed.')).toEqual({ ok: true })
    const [answer] = wire.sent
    expect(answer.kind).toBe(1111)
    expect(values(answer, 'h')).toEqual([DOC_FOLDER])
    expect(values(answer, 'A')).toEqual([DOC])
    expect(values(answer, 'e')).toEqual([leaf.id])
  })
})
