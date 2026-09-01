import { describe, it, expect, vi } from 'vitest'
import {
  MAX_TIMESTAMP,
  READ_STATE_TAG,
  advanceContexts,
  allSlotsFilter,
  buildReadStateEvent,
  fetchMergedReadState,
  isPublishableContextId,
  loadSlotIdentity,
  mergeBlobs,
  messageContext,
  parseReadStateBlob,
  projectContext,
  publishReadState,
  readStateDTag,
  serializeReadStateBlob,
  threadContext,
  toContextSeconds,
  type Nip44,
  type ReadStateBlob,
} from './readState'

const FOLDER = 'b7c1e0a4-2f3d-4a86-9c15-8d0e6f2a4b91'
const OTHER_FOLDER = 'c8d2f1b5-3a4e-4b97-8d26-9e1f7a3b5c02'
const ROOT = 'a'.repeat(64)
const OTHER_ROOT = 'b'.repeat(64)
const SLOT = '0123456789abcdef0123456789abcdef'

/**
 * The context grammar, pinned against Peek's.
 *
 * These are the assertions that decide whether the feature works at all. Two
 * apps that disagree about a context id do not fail — they publish happily and
 * never see each other's read state, which is indistinguishable from the sync
 * simply not being built.
 */
describe('context identifiers (SPEC §11.1)', () => {
  /**
   * CRO-8's description says `h:<folder-uuid>`. SPEC §11.1, written by CRO-3
   * afterwards, says bare and makes prefixing a MUST NOT. Peek writes the bare
   * form; blobs are grow-only, so a prefixed key here would be permanent and the
   * two apps would never agree about any container.
   */
  it("makes a project's context the BARE folder uuid, with no prefix", () => {
    expect(projectContext(FOLDER)).toBe(FOLDER)
    expect(projectContext(FOLDER)).not.toContain('h:')
  })

  it('refuses a folder id that is not a uuid rather than coercing it', () => {
    // A project re-pointed by a kind:1851 could carry anything.
    expect(projectContext('not-a-uuid')).toBeUndefined()
    expect(projectContext('')).toBeUndefined()
    expect(projectContext(null)).toBeUndefined()
  })

  it('normalises an upper-cased uuid to the relay spelling', () => {
    expect(projectContext(FOLDER.toUpperCase())).toBe(FOLDER)
  })

  it("makes an issue's discussion a thread context, never a container", () => {
    expect(threadContext(ROOT)).toBe(`thread:${ROOT}`)
    expect(messageContext(ROOT)).toBe(`msg:${ROOT}`)
  })

  it('refuses a thread context that is not a 64-hex event id', () => {
    // An issue *address* is the obvious wrong thing to hand in here.
    expect(threadContext('30851:abc:9f1b4a2c-7e3d-4c8a-9b2e-1d5f6a7b8c9d')).toBeUndefined()
    expect(threadContext('a'.repeat(63))).toBeUndefined()
  })

  it('accepts the three well-known grains and nothing else', () => {
    expect(isPublishableContextId(FOLDER)).toBe(true)
    expect(isPublishableContextId(`thread:${ROOT}`)).toBe(true)
    expect(isPublishableContextId(`msg:${ROOT}`)).toBe(true)
    expect(isPublishableContextId(`h:${FOLDER}`)).toBe(false)
    expect(isPublishableContextId('x'.repeat(257))).toBe(false)
  })
})

describe('the write discipline (SPEC §11.2, §11.4)', () => {
  /**
   * The mapping mistake the ticket names: an issue is an object inside a
   * Folder, so advancing its discussion must leave the project alone. Getting
   * it the other way makes reading one issue mark the whole project read.
   */
  it("reading an issue's thread leaves its project's container untouched", () => {
    const before = { [FOLDER]: 1000 }
    const after = advanceContexts(before, { [`thread:${ROOT}`]: 2000 })
    expect(after[FOLDER]).toBe(1000)
    expect(after[`thread:${ROOT}`]).toBe(2000)
  })

  it('reading one discussion does not touch another on the same issue', () => {
    const after = advanceContexts({ [`thread:${OTHER_ROOT}`]: 1000 }, { [`thread:${ROOT}`]: 2000 })
    expect(after[`thread:${OTHER_ROOT}`]).toBe(1000)
  })

  it('never lowers a timestamp, because there is no mark-as-unread', () => {
    expect(advanceContexts({ [FOLDER]: 5000 }, { [FOLDER]: 1000 })[FOLDER]).toBe(5000)
    expect(advanceContexts({ [FOLDER]: 5000 }, { [FOLDER]: 9000 })[FOLDER]).toBe(9000)
  })

  it('drops what it would not publish rather than passing it through', () => {
    const after = advanceContexts({}, {
      [`h:${FOLDER}`]: 1000,
      'thread:short': 1000,
      [FOLDER]: 1000,
    })
    expect(Object.keys(after)).toEqual([FOLDER])
  })

  it('converts epoch ms to the unix seconds NIP-RS stores', () => {
    expect(toContextSeconds(1_800_000_000_000)).toBe(1_800_000_000)
    expect(toContextSeconds(-1)).toBe(0)
    expect(toContextSeconds(Number.MAX_SAFE_INTEGER)).toBe(MAX_TIMESTAMP)
  })
})

describe('slot identity', () => {
  function memoryStorage(seed?: string): Storage {
    const map = new Map<string, string>()
    if (seed) map.set('ship.readstate.slot', seed)
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    } as unknown as Storage
  }

  it('mints a 32-hex slot and reuses it', () => {
    const storage = memoryStorage()
    const first = loadSlotIdentity(storage)
    expect(first.slotId).toMatch(/^[0-9a-f]{32}$/)
    expect(first.clientId.startsWith('ship-')).toBe(true)
    expect(loadSlotIdentity(storage)).toEqual(first)
  })

  /** Per installation, so Ship's slot is Peek's peer rather than its clone. */
  it("names itself ship-, so a merged blob says which app wrote it", () => {
    expect(loadSlotIdentity(memoryStorage()).clientId).toMatch(/^ship-[0-9a-f]{8}$/)
  })

  it('re-mints rather than trusting a corrupted stored slot', () => {
    expect(loadSlotIdentity(memoryStorage('not json')).slotId).toMatch(/^[0-9a-f]{32}$/)
  })

  it('degrades to an ephemeral slot when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(loadSlotIdentity(throwing).slotId).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('the event (SPEC §11.6)', () => {
  const event = buildReadStateEvent('pub', 1_800_000_000_000, SLOT, 'cipher')

  it('carries exactly one d tag and exactly one read-state t tag', () => {
    expect(event.tags.filter((t) => t[0] === 'd')).toEqual([['d', `read-state:${SLOT}`]])
    expect(event.tags.filter((t) => t[0] === 't')).toEqual([['t', READ_STATE_TAG]])
  })

  it('carries no h tag, so a global event is not scoped into a channel', () => {
    expect(event.tags.some((t) => t[0] === 'h')).toBe(false)
  })

  it('refuses a malformed slot id', () => {
    expect(() => readStateDTag('nope')).toThrow(/32 lowercase hex/)
  })

  it('asks only for this person’s own slots', () => {
    const filter = allSlotsFilter('mypubkey', 1_800_000_000_000)
    expect(filter.authors).toEqual(['mypubkey'])
    expect(filter['#t']).toEqual(['read-state'])
    expect(filter.kinds).toEqual([30078])
  })
})

describe('the blob', () => {
  it('round-trips and sorts its keys', () => {
    const blob: ReadStateBlob = { v: 1, client_id: 'ship-abc', contexts: { [FOLDER]: 1000 } }
    expect(parseReadStateBlob(serializeReadStateBlob(blob))).toEqual(blob)
    const a = serializeReadStateBlob({ v: 1, client_id: 'x', contexts: { [FOLDER]: 1, [`msg:${ROOT}`]: 2 } })
    const b = serializeReadStateBlob({ v: 1, client_id: 'x', contexts: { [`msg:${ROOT}`]: 2, [FOLDER]: 1 } })
    expect(a).toBe(b)
  })

  it('keeps the good entries and drops only the bad', () => {
    const parsed = parseReadStateBlob(
      JSON.stringify({ v: 1, client_id: 'ship-abc', contexts: { [FOLDER]: 1000, bad: 2000 } }),
    )
    expect(parsed?.contexts).toEqual({ [FOLDER]: 1000 })
  })

  it('refuses a blob it cannot trust, so it is not republished over', () => {
    expect(parseReadStateBlob('not json')).toBeUndefined()
    expect(parseReadStateBlob(JSON.stringify({ v: 2, contexts: {} }))).toBeUndefined()
  })

  it('merges slots with the max rule', () => {
    expect(
      mergeBlobs([
        { v: 1, client_id: 'ship-a', contexts: { [FOLDER]: 1000, [`thread:${ROOT}`]: 5000 } },
        { v: 1, client_id: 'peek-b', contexts: { [FOLDER]: 9000 } },
      ]),
    ).toEqual({ [FOLDER]: 9000, [`thread:${ROOT}`]: 5000 })
  })
})

describe('fetchMergedReadState', () => {
  const nip44: Nip44 = {
    encrypt: async (p) => `enc(${p})`,
    decrypt: async (c) => (c.startsWith('enc(') ? c.slice(4, -1) : undefined),
  }
  const slotEvent = (slotId: string, blob: ReadStateBlob) => ({
    id: 'x',
    pubkey: 'me',
    created_at: 1,
    kind: 30078,
    tags: [['d', `read-state:${slotId}`], ['t', 'read-state']],
    content: `enc(${serializeReadStateBlob(blob)})`,
    sig: 's',
  })

  it("merges every slot and names this installation's own", async () => {
    const other = 'f'.repeat(32)
    const relay = {
      query: async () => [
        slotEvent(SLOT, { v: 1, client_id: 'ship-a', contexts: { [FOLDER]: 1000 } }),
        slotEvent(other, { v: 1, client_id: 'peek-b', contexts: { [FOLDER]: 9000 } }),
      ],
    }
    const state = await fetchMergedReadState(relay as never, 'me', nip44, {
      slotId: SLOT,
      clientId: 'ship-a',
    })
    expect(state.reachable).toBe(true)
    expect(state.merged).toEqual({ [FOLDER]: 9000 })
    expect(state.own?.client_id).toBe('ship-a')
  })

  /**
   * Unreachable is not empty. Collapsing them is what made a first run in Peek
   * refuse to publish forever, silently — the two absences look identical and
   * mean opposite things.
   */
  it('reports unreachable rather than an empty merge when the query fails', async () => {
    const relay = {
      query: async () => {
        throw new Error('403 relay_membership_required')
      },
    }
    const state = await fetchMergedReadState(relay as never, 'me', nip44, {
      slotId: SLOT,
      clientId: 'ship-a',
    })
    expect(state.reachable).toBe(false)
    expect(state.merged).toEqual({})
  })

  it('skips a blob that will not decrypt instead of failing the read', async () => {
    const relay = {
      query: async () => [
        { ...slotEvent(SLOT, { v: 1, client_id: 'ship-a', contexts: { [FOLDER]: 1000 } }), content: 'rotated-key' },
        slotEvent('f'.repeat(32), { v: 1, client_id: 'peek-b', contexts: { [OTHER_FOLDER]: 3000 } }),
      ],
    }
    const state = await fetchMergedReadState(relay as never, 'me', nip44, {
      slotId: SLOT,
      clientId: 'ship-a',
    })
    expect(state.merged).toEqual({ [OTHER_FOLDER]: 3000 })
  })
})

describe('publishReadState', () => {
  it('encrypts, signs and publishes the whole blob', async () => {
    const publish = vi.fn(async () => ({ ok: true, eventId: 'e' }))
    const sign = vi.fn(async (u: unknown) => ({ ...(u as object), id: 'e', sig: 's' }))
    const nip44: Nip44 = { encrypt: async (p) => `enc(${p})`, decrypt: async () => undefined }

    const result = await publishReadState(
      { publish } as never,
      { pubkey: 'me', sign } as never,
      nip44,
      { slotId: SLOT, clientId: 'ship-a' },
      { [FOLDER]: 1000, [`thread:${ROOT}`]: 2000 },
    )

    expect(result.ok).toBe(true)
    const signed = sign.mock.calls[0][0] as { content: string; tags: string[][] }
    expect(signed.content).toContain(`"${FOLDER}":1000`)
    expect(signed.content).toContain(`"thread:${ROOT}":2000`)
    expect(signed.tags).toContainEqual(['d', `read-state:${SLOT}`])
  })

  it('reports the relay’s reason rather than swallowing a refusal', async () => {
    const publish = vi.fn(async () => ({ ok: false, reason: 'kind_not_allowed' }))
    const result = await publishReadState(
      { publish } as never,
      { pubkey: 'me', sign: async (u: unknown) => ({ ...(u as object), id: 'e', sig: 's' }) } as never,
      { encrypt: async (p) => p, decrypt: async () => undefined },
      { slotId: SLOT, clientId: 'ship-a' },
      { [FOLDER]: 1000 },
    )
    expect(result).toEqual({ ok: false, reason: 'kind_not_allowed' })
  })
})
