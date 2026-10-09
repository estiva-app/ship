/**
 * One block of another object, live in a message — SPEC §13.6.1, COM-2.
 *
 * The relay is mocked at `./store`, the manifests at `./handoff` (Ship's own,
 * built by `buildManifest`, so a change to its `urls` shows up here), and the
 * object at `./foreign`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { serializeBlockDocument, type SignedEvent } from '@estiva-app/protocol'
import { buildManifest } from '@/nostr/manifest'

const query = vi.hoisted(() => vi.fn())
const resolve = vi.hoisted(() => vi.fn())
const paused = vi.hoisted(() => ({ ms: 0 }))
vi.mock('./store', () => ({ relay: { query: (filters: unknown[]) => query(filters) } }))
vi.mock('./foreign', () => ({ resolveForeign: resolve }))
vi.mock('@/lib/relayBudget', () => ({ pausedForMs: () => paused.ms }))
vi.mock('./handoff', () => ({
  declaredManifests: async () => [{ ...buildManifest('8'.repeat(64), 0, 'https://ship.estiva.app'), id: 'm', sig: '' }],
}))

import { partTagsFor, readPart, resetParts, shownParts, urlNames, usePart } from './part'

const AUTHOR = 'f'.repeat(64)
const D = 'b4ea696a-d4a2-4833-8f2a-6aa1e2f3c4d5'
const ADDRESS = `30851:${AUTHOR}:${D}`
const LINK = `https://ship.estiva.app/issue/plan-the-launch-${D}#block-p1`

const issueEvent = { id: 'e', sig: '', pubkey: AUTHOR, kind: 30851, created_at: 1, tags: [['d', D]], content: '' } as SignedEvent

const object = (blocks: { type: string; id: string; content?: unknown[] }[]) => ({
  ref: ADDRESS,
  appName: 'Ship',
  noun: 'issue',
  openUrl: `https://ship.estiva.app/issue/plan-the-launch-${D}`,
  slots: {
    title: { value: 'Plan the launch' },
    body: { value: serializeBlockDocument({ type: 'doc', content: blocks as never }), format: 'blocks' },
  },
})
const paragraph = (id: string, text: string) => ({ type: 'paragraph', id, content: [{ type: 'text', text }] })

afterEach(() => {
  resetParts()
  query.mockReset()
  resolve.mockReset()
  paused.ms = 0
})

describe('partTagsFor — a pasted block link earns its tags', () => {
  it('writes `a` and `part` for a Copy link, resolving the address by its d', async () => {
    query.mockResolvedValue([issueEvent])
    expect(await partTagsFor(`look at this ${LINK}.`)).toEqual([
      ['a', ADDRESS],
      ['part', ADDRESS, 'p1'],
    ])
    expect(query).toHaveBeenCalledWith([{ '#d': [D], kinds: [30851], limit: 1 }])
  })

  it('keeps only `part` when the message is on that object, whose `a` it already carries', async () => {
    query.mockResolvedValue([issueEvent])
    expect(await partTagsFor(LINK, ADDRESS)).toEqual([['part', ADDRESS, 'p1']])
  })

  it('one block per object: the first link wins', async () => {
    query.mockResolvedValue([issueEvent])
    const tags = await partTagsFor(`${LINK} and ${LINK.replace('p1', 'p2')}`)
    expect(tags.filter((t) => t[0] === 'part')).toEqual([['part', ADDRESS, 'p1']])
  })

  it('earns nothing for a link with no block, or one nothing resolves', async () => {
    query.mockResolvedValue([issueEvent])
    expect(await partTagsFor(LINK.split('#')[0])).toEqual([])
    query.mockResolvedValue([])
    expect(await partTagsFor(LINK)).toEqual([])
    expect(await partTagsFor('no links here')).toEqual([])
  })
})

describe('shownParts — drawn only while the body still names the object', () => {
  const parts = [{ address: ADDRESS, block: 'p1' }]
  it('by its pasted link', () => {
    expect(shownParts(parts, `see ${LINK}`)).toEqual(parts)
  })
  it('not once an edit took the link out', () => {
    expect(shownParts(parts, 'never mind')).toEqual([])
  })
  it('by a nostr: pointer the caller resolved', () => {
    expect(shownParts(parts, 'see nostr:naddr1…', new Set([ADDRESS]))).toEqual(parts)
  })
  it('at most six', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ address: `30851:${AUTHOR}:${D.slice(0, -1)}${i}`, block: 'p' }))
    const body = many.map((p) => `https://ship.estiva.app/issue/x-${p.address.split(':')[2]}#block-p`).join(' ')
    expect(shownParts(many, body)).toHaveLength(6)
  })
  it('a short d names nothing', () => {
    expect(urlNames('https://x.example/issue/a-1', `30851:${AUTHOR}:1`)).toBe(false)
  })
})

describe('readPart — five states, none collapsed', () => {
  it('resolved: the block, with the link to that block from the manifest', async () => {
    resolve.mockResolvedValue(object([paragraph('p1', 'Hello')]))
    const view = await readPart({ address: ADDRESS, block: 'p1' })
    expect(view.state).toBe('resolved')
    if (view.state !== 'resolved') return
    expect(view.block.id).toBe('p1')
    expect(view.link).toBe(LINK)
  })

  it('detached: the object is there and the block is not', async () => {
    resolve.mockResolvedValue(object([paragraph('p2', 'Other')]))
    expect((await readPart({ address: ADDRESS, block: 'p1' })).state).toBe('detached')
  })

  it('deleted: nothing came back and its author deleted it', async () => {
    resolve.mockResolvedValue(null)
    query.mockResolvedValue([{ id: 'x', sig: '', pubkey: AUTHOR, kind: 5, created_at: 2, tags: [['a', ADDRESS]], content: '' }])
    expect((await readPart({ address: ADDRESS, block: 'p1' })).state).toBe('deleted')
  })

  it("unreadable: interop's unreachable stub, and no deletion — no title, no text", async () => {
    resolve.mockResolvedValue({ ...object([]), unreachable: true })
    query.mockResolvedValue([])
    expect(await readPart({ address: ADDRESS, block: 'p1' })).toEqual({ state: 'unreadable' })
  })

  it('a deletion the relay did not check is not a deletion: the address as a second `a`', async () => {
    resolve.mockResolvedValue(null)
    const other = `30851:${'b'.repeat(64)}:mine`
    query.mockResolvedValue([{ id: 'x', sig: '', pubkey: 'b'.repeat(64), kind: 5, created_at: 2, tags: [['a', other], ['a', ADDRESS]], content: '' }])
    expect((await readPart({ address: ADDRESS, block: 'p1' })).state).toBe('unreadable')
  })
})

describe('usePart — one poll per block, paused with the relay budget', () => {
  function Probe() {
    return <span>{usePart({ address: ADDRESS, block: 'p1' }).state}</span>
  }

  it('reads once for two cards on the same block', async () => {
    resolve.mockResolvedValue(null)
    query.mockResolvedValue([])
    const { getAllByText } = render(
      <>
        <Probe />
        <Probe />
      </>,
    )
    await waitFor(() => expect(getAllByText('unreadable')).toHaveLength(2))
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('does not read while the relay has asked for a pause', async () => {
    paused.ms = 5_000
    const { unmount } = render(<Probe />)
    await new Promise((r) => setTimeout(r, 20))
    expect(resolve).not.toHaveBeenCalled()
    unmount()
  })
})
