/**
 * Ship's relay asks a list read once (ISS-9), at the wire: the requests a
 * cold tab's paged read sends for interop's list reads (SPEC §6.13, one
 * filter per author and kind), over a relay held in memory that answers a list
 * read as the relay does — each first record named by `#d` with its fields'
 * newest changes beside it, so the answer is longer than its `limit`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignedEvent } from '@estiva-app/protocol'

const A = 'aa'.repeat(32)
const B = 'bb'.repeat(32)
let ids = 0
const event = (kind: number, pubkey: string, tags: string[][], created_at: number): SignedEvent =>
  ({ id: (++ids).toString(16).padStart(64, '0'), kind, pubkey, tags, content: '', created_at, sig: '0'.repeat(128) }) as SignedEvent

/** A file: its first record and one change for each of its fields, all newer than it. */
function file(kind: number, pubkey: string, d: string, at: number): SignedEvent[] {
  const address = `${kind}:${pubkey}:${d}`
  const fields = ['title', 'status', 'assignee', 'summary', 'priority', 'archived']
  return [event(kind, pubkey, [['d', d]], at), ...fields.map((field, i) => event(1851, pubkey, [['a', address], ['field', field], ['value', 'x']], at + i + 1))]
}

const held = [...['p1', 'p2', 'p3'].flatMap((d, i) => file(30850, A, d, 1000 + 10 * i)), ...['t1', 't2'].flatMap((d, i) => file(30840, B, d, 2000 + 10 * i)), event(30078, A, [['t', 'read-state']], 500)]
let asked: Record<string, unknown>[][] = []

function answer(filters: Record<string, unknown>[]): SignedEvent[] {
  asked.push(filters)
  const out: SignedEvent[] = []
  for (const f of filters) {
    const named = (e: SignedEvent) => (f.kinds as number[]).includes(e.kind) && (!f.authors || (f.authors as string[]).includes(e.pubkey)) && (f.until === undefined || e.created_at <= (f.until as number))
    const roots = held.filter((e) => named(e) && (!f['#d'] || (f['#d'] as string[]).includes(e.tags.find((t) => t[0] === 'd')?.[1] ?? ''))).sort((x, y) => y.created_at - x.created_at).slice(0, Math.min((f.limit as number) ?? 1000, 1000))
    for (const root of roots) {
      out.push(root)
      if (f.fields !== 'newest') continue
      const address = `${root.kind}:${root.pubkey}:${root.tags.find((t) => t[0] === 'd')![1]}`
      out.push(...held.filter((e) => e.kind === 1851 && e.tags.some((t) => t[0] === 'a' && t[1] === address)))
    }
  }
  return out
}

const listRead = (kind: number, pubkey: string, ds: string[]) => ({ kinds: [kind], authors: [pubkey], '#d': ds, limit: ds.length, fields: 'newest' })

beforeEach(() => {
  asked = []
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const body = new URL(url).pathname === '/query' ? JSON.stringify(answer(JSON.parse(init.body))) : '{}'
    return new Response(body, { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("Ship's relay, a cold tab's paged read of list reads", () => {
  it('asks every list read in one request, and gets every file with its fields', async () => {
    const { relay } = await import('./store')
    const got = await relay.queryAll([listRead(30850, A, ['p1', 'p2', 'p3']), listRead(30840, B, ['t1', 't2'])])
    expect(asked).toHaveLength(1)
    expect(asked[0]).toHaveLength(2)
    expect(got.filter((e) => e.kind === 30850 || e.kind === 30840)).toHaveLength(5)
    expect(got.filter((e) => e.kind === 1851)).toHaveLength(30)
  })

  it('asks plain filters beside them in a request of their own, as the relay requires', async () => {
    const { relay } = await import('./store')
    const got = await relay.queryAll([listRead(30850, A, ['p1', 'p2', 'p3']), { kinds: [30078], authors: [A], '#t': ['read-state'] }])
    expect(asked.some((filters) => filters.some((f) => f.fields) && filters.some((f) => !f.fields))).toBe(false)
    expect(asked.filter((filters) => filters.some((f) => f.fields))).toHaveLength(1)
    expect(got.filter((e) => e.kind === 30078)).toHaveLength(1)
    expect(got.filter((e) => e.kind === 30850)).toHaveLength(3)
  })
})
