import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
  The relay is the seam under test: `foreign.ts` hands the runtime a query
  function and a cache, and this counts what reaches the relay. Mocked at
  `./store` because that is where Ship's authenticated relay is built — nothing
  above it should have to know.
*/
const query = vi.fn()
vi.mock('./store', () => ({ relay: { query: (filters: unknown[]) => query(filters) } }))

import { resolveForeign } from './foreign'

const AUTHOR = 'a'.repeat(64)
const KIND = 30850
const ADDRESS = `${KIND}:${AUTHOR}:p1`

let seq = 0
const event = (partial: Record<string, unknown>) => ({
  id: String(++seq).padStart(64, '0'),
  sig: '',
  pubkey: AUTHOR,
  created_at: 1_700_000_000 + seq,
  tags: [] as string[][],
  content: '',
  ...partial,
})

const manifest = event({
  kind: 31990,
  tags: [['d', 'some-app'], ['k', String(KIND)]],
  content: JSON.stringify({
    name: 'Some app',
    projections: { [KIND]: { widget: 'card', slots: { title: { tag: 'title' } } } },
  }),
})
const object = event({ kind: KIND, tags: [['d', 'p1'], ['title', 'A project']] })

const world = [manifest, object]

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (filters: Record<string, unknown>[]) =>
    world.filter((e) =>
      filters.some((f) => {
        if (f.kinds && !(f.kinds as number[]).includes(e.kind as number)) return false
        if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false
        for (const [key, want] of Object.entries(f)) {
          if (!key.startsWith('#')) continue
          const held = (e.tags as string[][]).filter((t) => t[0] === key.slice(1)).map((t) => t[1])
          if (!(want as string[]).some((v) => held.includes(v))) return false
        }
        return true
      }),
    ),
  )
})

describe('resolveForeign — a widget that refreshes must not re-discover the app (SHI-13)', () => {
  it('costs one request the second time, having already found who draws this kind', async () => {
    /*
      Ship re-resolves every reference on the poll (PRO-10), so this runs on a
      timer for as long as the issue is open. Two of the four round trips were
      NIP-89 discovery and answer the same thing every time; the relay meters
      the whole tab at 300 reads a minute (SHI-12), so this is budget.

      The assertion is on the *second* resolve, which is the one that repeats.
    */
    const first = await resolveForeign(ADDRESS)
    expect(first?.slots.title?.value).toBe('A project')
    const discovery = query.mock.calls.length
    expect(discovery).toBeGreaterThan(1)

    query.mockClear()
    const again = await resolveForeign(ADDRESS)

    expect(again?.slots.title?.value).toBe('A project')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('still re-reads the object itself, so the widget is not a screenshot', async () => {
    await resolveForeign(ADDRESS)
    // The title changes at the relay between ticks — a rename in the other app.
    world[1] = event({ kind: KIND, tags: [['d', 'p1'], ['title', 'Renamed elsewhere']] })

    const after = await resolveForeign(ADDRESS)

    expect(after?.slots.title?.value).toBe('Renamed elsewhere')
    world[1] = object
  })
})
