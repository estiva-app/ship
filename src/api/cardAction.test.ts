/**
 * A card's picker changes the file — WBM-5, Decided 16 Oct: any reader may
 * change a file from its card. Asserted at the wire: what the relay is asked
 * to accept, built from the file's own manifest, signed by the reader.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addrToNaddr, type SignedEvent } from '@estiva-app/protocol'
import { buildManifest } from '../nostr/manifest'

// Read while the module mock is built, which runs before this file's own lines.
const { READER, publish } = vi.hoisted(() => ({
  READER: 'f3a38fa6c6a1e5d2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081920',
  publish: vi.fn(async (event: import('@estiva-app/protocol').SignedEvent) => ({ ok: true, eventId: event.id }) as { ok: boolean; reason?: string }),
}))
const SHIP = 'cb77583ed45cac74ce4e46c626c1edada0204a6fc4c91f9c7be230b5af36156c'
const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const FOLDER = '05bebd5b-b699-4bd4-af50-f5377df0fd67'
const ISSUE = `30851:${SHIP}:c0b27d90-d5b9-40e7-8078-865ab36a421c`

const signed = (event: Omit<SignedEvent, 'id' | 'sig'>, id: string): SignedEvent => ({ ...event, id: id.padStart(64, '0'), sig: '' })
const shipManifest = signed(buildManifest(SHIP, 1_700_000_000_000), '1')
/** Ship's manifest with its status action rewritten by a stranger: the manifest is anyone's text on the relay. */
const tampered = (change: Record<string, unknown>) => {
  const content = JSON.parse(shipManifest.content)
  content.actions = content.actions.map((action: { id: string; emits: object }) => (action.id === 'set-issue-status' ? { ...action, emits: { ...action.emits, ...change } } : action))
  if (change.records) content.records = { ...content.records, ...(change.records as object) }
  return { ...shipManifest, content: JSON.stringify(content) }
}
let manifest = shipManifest
const PROJECT = `30850:${SHIP}:5b1f0a8e-6c1d-4c55-9a0e-2f0d3c1b7e44`
const root = signed({ pubkey: SHIP, created_at: 1_700_000_100, kind: 30851, tags: [['d', ISSUE.split(':')[2]], ['h', FOLDER], ['a', PROJECT], ['title', 'Cards draw from the kit']], content: '' }, '2')
/** The project's root: an ancestor whose root cannot be read counts as not archived (SPEC §6.5). */
const projectRoot = signed({ pubkey: SHIP, created_at: 1_700_000_050, kind: 30850, tags: [['d', PROJECT.split(':')[2]], ['h', FOLDER], ['title', 'Cards']], content: '' }, '4')
/** Ship's archive of a file, as its page writes it. */
const archiving = (address: string) => signed({ pubkey: SHIP, created_at: 1_700_000_200, kind: 1851, tags: [['a', address], ['field', 'archived'], ['value', 'true'], ['h', FOLDER]], content: '' }, '3')
let changes: SignedEvent[] = []

vi.mock('./store', () => ({
  relay: {
    query: async (filters: { kinds?: number[] }[]) => {
      const kinds = filters.flatMap((f) => f.kinds ?? [])
      if (kinds.includes(31990)) return [manifest]
      return [...(kinds.includes(30851) ? [root] : []), ...(kinds.includes(30850) ? [projectRoot] : []), ...(kinds.includes(1851) ? changes : [])]
    },
    publish: (event: SignedEvent) => publish(event),
  },
  signer: { pubkey: READER, sign: async (event: Omit<SignedEvent, 'id' | 'sig'>) => ({ ...event, id: 'f'.repeat(64), sig: '' }) },
}))

import { applyCardAction } from './foreign'

const tagsOf = (event: SignedEvent) => Object.fromEntries(event.tags.map((t) => [t[0], t[1]]))

beforeEach(() => {
  publish.mockClear()
  manifest = shipManifest
  changes = []
})

describe('a change made from a card', () => {
  it('publishes the issue’s status change into its Folder, signed by the reader', async () => {
    expect(await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'set-issue-status', value: 'done' })).toEqual({ ok: true })
    const [event] = publish.mock.calls[0]
    expect(event.kind).toBe(1851)
    expect(event.pubkey).toBe(READER)
    expect(tagsOf(event)).toMatchObject({ a: ISSUE, h: FOLDER, field: 'status', value: 'done' })
  })

  it('publishes the assignee change the same way', async () => {
    await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'assign-issue', value: ADA })
    expect(tagsOf(publish.mock.calls[0][0])).toMatchObject({ a: ISSUE, h: FOLDER, field: 'assignee', value: ADA })
  })

  it('writes nothing for an action that creates or deletes a file, which a card never offers', async () => {
    const result = await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'delete-issue', value: '' })
    expect(result.ok).toBe(false)
    expect(publish).not.toHaveBeenCalled()
  })

  // Leaf's `saveCardChoice` refuses the same (5ebf2756): a card holds a status and an owner, never a file's words, archive or place.
  it('writes nothing for a rename, a description, an archive or a move, though each is a change of one field', async () => {
    for (const actionId of ['rename-issue', 'describe-issue', 'summarize-issue', 'archive-issue', 'move-issue']) {
      const result = await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId, value: 'true' })
      expect(result.ok, actionId).toBe(false)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('writes nothing to an archived issue, nor to an issue whose project is archived', async () => {
    for (const archived of [ISSUE, PROJECT]) {
      changes = [archiving(archived)]
      // A fresh module: the tab holds what it first read.
      vi.resetModules()
      const { applyCardAction } = await import('./foreign')
      const result = await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'set-issue-status', value: 'done' })
      expect(result.ok, archived).toBe(false)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  // The security review of WBM-5: a "status" whose manifest emits another kind would have the reader sign that kind.
  it('signs nothing when a manifest’s status emits anything but a change of that field', async () => {
    for (const change of [{ kind: 31989 }, { kind: 5 }, { listed: true }]) {
      manifest = tampered(change)
      // A fresh module: the tab holds the manifest it first read.
      vi.resetModules()
      const { applyCardAction } = await import('./foreign')
      const result = await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'set-issue-status', value: 'done' })
      expect(result.ok, JSON.stringify(change)).toBe(false)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('says what the relay answered when it refuses', async () => {
    publish.mockResolvedValueOnce({ ok: false, reason: 'restricted: not a member' })
    expect(await applyCardAction({ reference: `nostr:${addrToNaddr(ISSUE)}`, actionId: 'set-issue-status', value: 'done' })).toEqual({ ok: false, reason: 'restricted: not a member' })
  })
})
