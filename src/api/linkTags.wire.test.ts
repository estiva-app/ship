/**
 * The tags a comment carries for what its words link — SPEC §13.1, §13.6.1,
 * PEEKM-7 — asserted on the signed event that would reach the relay. The
 * relay's reads are stubbed at `./store` and the manifests at `./handoff`;
 * the link reader, the writes and the `Store` that signs are real.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-edit-says-what-the-message-links-now.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeNaddr, encodeNpub, type Relay, type SignedEvent, type UnsignedEvent } from '@estiva-app/protocol'
import { messageReference } from '@estiva-app/conversation'

const PK = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'

const wire = vi.hoisted(() => ({
  store: undefined as unknown as Record<'postMessage' | 'editMessage', (args: unknown) => unknown>,
  sent: [] as { kind: number; tags: string[][]; content: string }[],
  /** The types the relay says it keeps in order (NIP-11 `files.requires_prev`): none until a test switches it. */
  inOrder: [] as string[],
}))
// The writes hand their calls to a real `Store` (below), whose relay keeps what it was sent.
vi.mock('./store', () => ({
  store: {
    postMessage: (args: unknown) => wire.store.postMessage(args),
    editMessage: (args: unknown) => wire.store.editMessage(args),
  },
  inOrderOption: async () => (wire.inOrder.length ? { inOrder: wire.inOrder } : {}),
  relay: {
    // Every `d` asked about is one issue by one author, as the relay would answer it.
    query: async (filters: { '#d'?: string[] }[]) => (filters[0]['#d'] ?? []).map((d) => ({ kind: 30851, pubkey: PK, tags: [['d', d]], id: d, content: '', created_at: 1, sig: '' })),
  },
}))
vi.mock('./handoff', () => ({
  declaredManifests: async () => [
    { kind: 31990, pubkey: 'c'.repeat(64), id: 'm'.repeat(64), sig: '', created_at: 1, content: '{}', tags: [['web', 'https://ship.estiva.app/o/<bech32>', 'naddr'], ['urls', 'https://ship.estiva.app/issue/<slug>-<d>#block-<block>', '30851'], ['k', '30851']] },
  ],
}))
vi.mock('./clock', () => ({ clockProblem: async () => null }))
vi.mock('./foreign', () => ({ readFolders: vi.fn(), readFolderListing: vi.fn(), loadQuery: () => async () => [] }))

import { Store } from '../nostr/store'
import type { Signer } from '../nostr/signer'
import { editMessage, startConversation } from './writes'

const FOLDER = '3167adea-877f-43c4-96fb-517a2b2d5d24'
/** A `d` as Ship mints one: a uuid, which is what `<slug>-<d>` reads. */
const d = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const ISSUE = `30851:${PK}:${d(9)}`
const issueAt = (n: number) => `https://ship.estiva.app/issue/plan-${d(n)}`
const values = (event: { tags: string[][] }, name: string) => event.tags.filter((t) => t[0] === name).map((t) => t[1])

beforeEach(() => {
  vi.useFakeTimers()
  wire.sent = []
  wire.inOrder = []
  const relay = { publish: async (event: SignedEvent) => (wire.sent.push(event), { ok: true }) } as unknown as Relay
  const signer = { pubkey: PK, sign: async (unsigned: UnsignedEvent) => ({ ...unsigned, id: 'e'.repeat(64), sig: '0'.repeat(128) }) } as unknown as Signer
  wire.store = new Store(relay, signer, undefined, undefined, async () => wire.inOrder) as unknown as typeof wire.store
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a comment sent from Ship tags what its words link', () => {
  it('a URL in a code span earns nothing, and [A](B) earns B only', async () => {
    const body = `Not this: \`${issueAt(1)}\`. This: [${issueAt(2)}](${issueAt(3)}).`
    expect(await startConversation({ folder: FOLDER, about: ISSUE, body })).toEqual({ ok: true })
    const comment = wire.sent.at(-1)!
    expect(comment.kind).toBe(1111)
    // The comment's own file (NIP-22's lowercase a), then the one file the words link.
    expect(values(comment, 'a')).toEqual([ISSUE, `30851:${PK}:${d(3)}`])
  })

  // ONE-11: an issue comment's words used to end with `\n\nnostr:naddr…` of the issue, drawn as an extra row in Peek and Leaf.
  it('a comment on an issue sends only its words; its tags say which issue it is on', async () => {
    expect(await startConversation({ folder: FOLDER, about: ISSUE, body: 'Looks right.' })).toEqual({ ok: true })
    const comment = wire.sent.at(-1)!
    expect(comment.content).toBe('Looks right.')
    expect(values(comment, 'A')).toEqual([ISSUE])
  })
})

// ALO-8: from the switch a project is named by its id as well, in every app (decided 2026-11-06). Ship wrote none.
describe('once the relay keeps projects in order, a comment from Ship names a project by its id too', () => {
  const PROJECT = `30850:${PK}:${d(8)}`
  const projectLink = `nostr:${encodeNaddr({ kind: 30850, pubkey: PK, identifier: d(7), relays: [] })}`

  it('a comment on a project carries O and o with its id beside A and a', async () => {
    wire.inOrder = ['osnova.project']
    expect(await startConversation({ folder: FOLDER, about: PROJECT, body: 'Looks right.' })).toEqual({ ok: true })
    const comment = wire.sent.at(-1)!
    expect(values(comment, 'A')).toEqual([PROJECT])
    expect(values(comment, 'O')).toEqual([d(8)])
    expect(values(comment, 'o')).toEqual([d(8)])
  })

  it('a project its words link gets an o beside its a, and an issue, not kept in order, gets none', async () => {
    wire.inOrder = ['osnova.project']
    await startConversation({ folder: FOLDER, about: ISSUE, body: `see ${projectLink} and ${issueAt(3)}` })
    const comment = wire.sent.at(-1)!
    expect(values(comment, 'a')).toEqual([ISSUE, `30850:${PK}:${d(7)}`, `30851:${PK}:${d(3)}`])
    expect(values(comment, 'o')).toEqual([d(7)])
  })

  it('an edit keeps the o of a project its new words link', async () => {
    wire.inOrder = ['osnova.project']
    await editMessage(FOLDER, 'c'.repeat(64), `now ${projectLink}`, { before: 'no links yet', here: ISSUE, own: { file: ISSUE }, files: [] })
    const edit = wire.sent.at(-1)!
    expect(edit.kind).toBe(40003)
    expect(values(edit, 'o')).toEqual([d(7)])
  })

  it('before the switch the same comment names the project by its address alone', async () => {
    await startConversation({ folder: FOLDER, about: PROJECT, body: `see ${projectLink}` })
    const comment = wire.sent.at(-1)!
    expect(comment.tags.filter((t) => t[0] === 'O' || t[0] === 'o')).toEqual([])
  })
})

describe('an edit says what the message links now', () => {
  it('carries the a and q its new words earn, minus its own file and the message it answers, and never p, urgent or part', async () => {
    const BOB = 'd'.repeat(64)
    const PARENT = 'a'.repeat(64)
    const QUOTED = 'f'.repeat(64)
    const body = [
      `nostr:${encodeNpub(BOB)}, see ${issueAt(4)}#block-p1`,
      `and ${messageReference(QUOTED, 1111)}, not ${messageReference(PARENT, 1111)},`,
      `nor ${issueAt(9)}.`,
    ].join(' ')
    const result = await editMessage(FOLDER, 'c'.repeat(64), body, { before: 'no links yet', here: ISSUE, own: { file: ISSUE, parent: PARENT }, files: [] })
    expect(result).toEqual({ ok: true })
    const edit = wire.sent.at(-1)!
    expect(edit.kind).toBe(40003)
    expect(values(edit, 'a')).toEqual([`30851:${PK}:${d(4)}`])
    expect(values(edit, 'q')).toEqual([QUOTED])
    expect(edit.tags.filter((t) => t[0] === 'p' || t[0] === 'urgent' || t[0] === 'part')).toEqual([])
  })

  it('an edit of a message not in hand is refused and signs nothing, so it cannot quote its own parent', async () => {
    const PARENT = 'a'.repeat(64)
    const before = wire.sent.length
    const result = await editMessage(FOLDER, 'c'.repeat(64), `now about ${messageReference(PARENT, 1111)}`, undefined, [])
    expect(result).toMatchObject({ ok: false })
    expect(wire.sent.length).toBe(before)
  })

  it('an edit that takes every link out carries none, so the message leaves every Mentioned in', async () => {
    await editMessage(FOLDER, 'c'.repeat(64), 'never mind', { before: `see ${issueAt(5)} and ${issueAt(6)}`, here: ISSUE, own: { file: ISSUE }, files: [] })
    const edit = wire.sent.at(-1)!
    expect(edit.kind).toBe(40003)
    expect(edit.content).toBe('never mind')
    expect(edit.tags.filter((t) => t[0] === 'a' || t[0] === 'q')).toEqual([])
  })

  it('an edit handed p, part and urgent tags signs only the a and q: it never notifies again or claims a block part', async () => {
    const BOB = 'd'.repeat(64)
    const X = `30851:${PK}:${d(7)}`
    const Y = 'f'.repeat(64)
    const linkTags = [['a', X], ['q', Y], ['p', BOB], ['part', X, 'p1'], ['urgent', BOB]]
    await wire.store.editMessage({ folder: FOLDER, messageEventId: 'c'.repeat(64), body: 'edited', linkTags })
    const edit = wire.sent.at(-1)!
    expect(edit.kind).toBe(40003)
    expect(edit.tags.filter((t) => ['a', 'q', 'p', 'part', 'urgent'].includes(t[0]))).toEqual([['a', X], ['q', Y]])
  })

  it('an edit that takes one of two links out carries only the one its words still link', async () => {
    await editMessage(FOLDER, 'c'.repeat(64), `just ${issueAt(6)}`, { before: `see ${issueAt(5)} and ${issueAt(6)}`, here: ISSUE, own: { file: ISSUE }, files: [] })
    const edit = wire.sent.at(-1)!
    expect(edit.kind).toBe(40003)
    expect(edit.tags.filter((t) => t[0] === 'a' || t[0] === 'q')).toEqual([['a', `30851:${PK}:${d(6)}`]])
  })
})
