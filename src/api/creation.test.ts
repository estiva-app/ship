/**
 * KIN-9 — Ship's ⌘K makes a Leaf document in a team by following Leaf's declared New document. Asserted at the wire:
 * what the relay is asked to accept, signed by the person in Ship. Only which manifest declares the action and which
 * teams the person is in are stubbed (interop's own tests cover how they are found); the events are built by interop's
 * real runtime from Leaf's declarations, copied below.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addrToNaddr, type SignedEvent } from '@estiva-app/protocol'

const { READER, RELAY, TEAM, LEAF, published, teams, leaf } = vi.hoisted(() => {
  const LEAF = '31990:9b0ff001e909e0c6eb9165b81118b0c580db2584c87e1c794a2ec9339f7541ec:estiva-leaf'
  /* Leaf's add-document and describe, as its manifest declares them (leaf src/manifest.ts). */
  const manifest = {
    records: { changeKind: 1851, targetTag: 'a', fieldTag: 'field', valueTag: 'value', order: ['ts', 'created_at', 'id'], rule: 'last-write-wins-per-field' },
    actions: [
      {
        id: 'add-document',
        label: 'New document',
        description: 'Start a document in a team.',
        effect: 'writes',
        appliesTo: '39000',
        emits: { kind: 30842, placement: 'h', listed: true },
        input: {
          type: 'object',
          properties: { title: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string', target: 'content', format: 'estiva-blocks-1' } },
          required: ['title'],
        },
      },
      { id: 'describe', label: 'Edit', description: 'Its text.', effect: 'writes', appliesTo: ['30842'], emits: { kind: 1851, field: 'description' }, input: { type: 'string', format: 'estiva-blocks-1' } },
    ],
  }
  return {
    READER: 'f3a38fa6c6a1e5d2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081920',
    RELAY: 'd'.repeat(64),
    TEAM: '05bebd5b-b699-4bd4-af50-f5377df0fd67',
    LEAF,
    published: [] as SignedEvent[],
    teams: { list: [] as { id: string; name?: string; hasState: boolean }[] },
    leaf: { manifest },
  }
})

vi.mock('@estiva-app/interop', async (importOriginal) => {
  const real = await importOriginal<typeof import('@estiva-app/interop')>()
  return {
    ...real,
    // A creation borrowed on a team comes with only what is declared there, as interop answers it.
    resolveActingManifest: async () => ({ address: LEAF, manifest: { ...leaf.manifest, actions: leaf.manifest.actions.filter((a) => [a.appliesTo].flat().includes('39000')) } }),
    resolveManifest: async () => ({ address: LEAF, manifest: leaf.manifest }),
    listFolders: async () => teams.list,
  }
})

vi.mock('./store', () => ({
  relay: {
    query: async () => [],
    queryAll: async () => [],
    publish: async (event: SignedEvent) => {
      published.push(event)
      return { ok: true, eventId: event.id }
    },
  },
  times: async () => [],
  searchedTypes: () => [],
  signer: { pubkey: READER, sign: async (event: Omit<SignedEvent, 'id' | 'sig'>) => ({ ...event, id: String(published.length + 1).padStart(64, '0'), sig: '' }) },
}))

import { applyCreation } from './foreign'

const tag = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const inOps = addrToNaddr(`39000:${RELAY}:${TEAM}`)

beforeEach(() => {
  published.length = 0
  teams.list = [{ id: TEAM, name: 'Ops', hasState: true }]
})

describe("Ship's ⌘K makes a Leaf document by Leaf's declared New document (KIN-9)", () => {
  it('makes the document in the chosen team, signed by the person, with its text as its first change, then lists it there', async () => {
    const result = await applyCreation({ naddr: inOps, actionId: 'add-document', declaredBy: LEAF, value: { title: 'Launch decisions', description: 'We launch on 3 December.' } })

    expect(result).toMatchObject({ ok: true })
    const [root, text, listing] = published
    expect(root.kind).toBe(30842)
    expect(root.pubkey).toBe(READER)
    expect(tag(root, 'h')).toBe(TEAM)
    expect(tag(root, 'title')).toBe('Launch decisions')
    expect(root.content).toBe('')
    expect(text.kind).toBe(1851)
    expect(tag(text, 'a')).toBe(`30842:${READER}:${tag(root, 'd')}`)
    expect(tag(text, 'field')).toBe('description')
    // A change carries its new value in its `value` tag (SPEC §6.2).
    expect(tag(text, 'value')).toBe('We launch on 3 December.')
    expect(listing.kind).toBe(1852)
    expect(tag(listing, 'h')).toBe(TEAM)
    expect((result as { created?: string }).created).toBe(`30842:${READER}:${tag(root, 'd')}`)
  })

  it('makes nothing in a team the person is not in', async () => {
    teams.list = []

    const result = await applyCreation({ naddr: inOps, actionId: 'add-document', declaredBy: LEAF, value: { title: 'Launch decisions' } })

    expect(result).toEqual({ ok: false, reason: 'That team is not one you are in, so nothing was made.' })
    expect(published).toEqual([])
  })

  it("signs no Ship project or issue this way: those are Ship's own forms", async () => {
    const declared = leaf.manifest.actions[0]
    leaf.manifest.actions[0] = { ...declared, emits: { kind: 30851, placement: 'h', listed: true } } as typeof declared
    try {
      const result = await applyCreation({ naddr: inOps, actionId: 'add-document', declaredBy: LEAF, value: { title: 'Not an issue' } })
      expect(result).toEqual({ ok: false, reason: 'Ship cannot make this.' })
      expect(published).toEqual([])
    } finally {
      leaf.manifest.actions[0] = declared
    }
  })
})
