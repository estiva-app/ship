/**
 * KIN-9 — Ship's ⌘K makes a Leaf document in a team by following Leaf's declared New document. Asserted at the wire:
 * what the relay is asked to accept, signed by the person in Ship. Only which manifest declares the action and which
 * teams the person is in are stubbed (interop's own tests cover how they are found); the events are built by interop's
 * real runtime from Leaf's declarations, copied below.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addrToNaddr, type SignedEvent } from '@estiva-app/protocol'

const { READER, RELAY, TEAM, LEAF, published, teams, leaf, signing } = vi.hoisted(() => {
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
    teams: { list: [] as { id: string; name?: string; hasState: boolean; listedIn?: string[]; archived?: { by: string; at: number } }[] },
    signing: { refuse: 0 },
    leaf: { manifest },
  }
})

vi.mock('@estiva-app/interop', async (importOriginal) => {
  const real = await importOriginal<typeof import('@estiva-app/interop')>()
  return {
    ...real,
    // A creation borrowed on a team comes with only what is declared there, as interop answers it.
    resolveActingManifest: async () => ({ address: LEAF, manifest: { ...leaf.manifest, actions: leaf.manifest.actions.filter((a) => [a.appliesTo].flat().includes('39000')) } }),
    // The newest manifest for a document is a stranger's (any key can publish one until WOR-2): its text must not matter.
    resolveManifest: async () => ({ address: '31990:ee11:planted', manifest: { actions: [] } }),
    listFolders: async () => teams.list,
    // What a team offers: Leaf's New document, by Leaf's manifest.
    resolveForeignObject: async () => ({ actions: [{ id: 'add-document', label: 'New document', control: 'form', declaredBy: { address: LEAF } }] }),
  }
})

vi.mock('./store', () => ({
  relay: {
    // Leaf's own manifest, by its address: where the text action is read from.
    query: async (filters: { kinds?: number[] }[]) =>
      filters.some((f) => f.kinds?.includes(31990))
        ? [{ kind: 31990, pubkey: LEAF.split(':')[1], created_at: 1, tags: [['d', 'estiva-leaf']], content: JSON.stringify(leaf.manifest), id: 'm'.repeat(64), sig: '' }]
        : filters.some((f) => f.kinds?.includes(39000))
          ? [{ kind: 39000, pubkey: RELAY, created_at: 1, tags: [['d', TEAM]], content: '', id: 't'.repeat(64), sig: '' }]
          : [],
    queryAll: async () => [],
    publish: async (event: SignedEvent) => {
      published.push(event)
      return { ok: true, eventId: event.id }
    },
  },
  times: async () => [],
  searchedTypes: () => [],
  signer: {
    pubkey: READER,
    sign: async (event: Omit<SignedEvent, 'id' | 'sig'>) => {
      // Estiva ID refusing one kind at /sign, as an expired token or a ceiling does.
      if (event.kind === signing.refuse) throw new Error('/sign refused this kind')
      return { ...event, id: String(published.length + 1).padStart(64, '0'), sig: '' }
    },
  },
}))

import { applyCreation, creatableUnder } from './foreign'

const tag = (event: SignedEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]
const inOps = addrToNaddr(`39000:${RELAY}:${TEAM}`)

beforeEach(() => {
  published.length = 0
  signing.refuse = 0
  // What the listing really holds: a team, a Peek topic listed in it, and an archived team.
  teams.list = [
    { id: TEAM, name: 'Ops', hasState: true },
    { id: 'topic-launch', name: 'Launch chat', hasState: true, listedIn: [TEAM] },
    { id: 'old-team', name: 'Old', hasState: true, archived: { by: READER, at: 1 } },
  ]
})

describe("Ship's ⌘K: where a Leaf document can go (KIN-9)", () => {
  it('offers New document in the teams only: never a Peek topic or an archived team', async () => {
    const read = await creatableUnder(39000)
    expect(read?.actions.map((a) => a.id)).toEqual(['add-document'])
    expect(read?.parentsFor?.['add-document']?.map((p) => p.title)).toEqual(['Ops'])
  })

  it('makes nothing in a Peek topic, though the person can read it', async () => {
    const result = await applyCreation({ naddr: addrToNaddr(`39000:${RELAY}:topic-launch`), actionId: 'add-document', declaredBy: LEAF, value: { title: 'Launch decisions' } })
    expect(result).toEqual({ ok: false, reason: 'That team is not one you are in, so nothing was made.' })
    expect(published).toEqual([])
  })
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

  it('signs no kind Ship may not sign, whatever a manifest declares', async () => {
    const declared = leaf.manifest.actions[0]
    leaf.manifest.actions[0] = { ...declared, emits: { kind: 1, placement: 'h', listed: true } } as typeof declared
    try {
      const result = await applyCreation({ naddr: inOps, actionId: 'add-document', declaredBy: LEAF, value: { title: 'A note' } })
      expect(result).toEqual({ ok: false, reason: 'Ship cannot make this.' })
      expect(published).toEqual([])
    } finally {
      leaf.manifest.actions[0] = declared
    }
  })

  it('says the document was made when only the team listing fails after it, so Create is not pressed twice', async () => {
    signing.refuse = 1852
    const result = await applyCreation({ naddr: inOps, actionId: 'add-document', declaredBy: LEAF, value: { title: 'Launch decisions', description: 'We launch on 3 December.' } })
    expect(published.map((e) => e.kind)).toEqual([30842, 1851])
    expect(result).toMatchObject({ ok: true, created: `30842:${READER}:${tag(published[0], 'd')}`, incomplete: '/sign refused this kind' })
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
