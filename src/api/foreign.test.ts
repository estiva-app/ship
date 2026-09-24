import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
  The relay is the seam under test: `foreign.ts` hands the runtime a query
  function and a cache, and this counts what reaches the relay. Mocked at
  `./store` because that is where Ship's authenticated relay is built — nothing
  above it should have to know.
*/
const query = vi.fn()
vi.mock('./store', () => ({ relay: { query: (filters: unknown[]) => query(filters) } }))

import { encodeNevent } from '@estiva-app/protocol'
import { isEventReference, resolveForeign } from './foreign'

const AUTHOR = 'a'.repeat(64)
const KIND = 30850
const ADDRESS = `${KIND}:${AUTHOR}:p1`

/*
  Typed rather than spread into an index signature: `...partial` on a
  `Record<string, unknown>` widens nothing, so `e.kind` is not a known property
  and `tsc -b` refuses it — which `vitest` does not, since it strips types
  rather than checking them.
*/
interface TestEvent {
  id: string
  sig: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
}

let seq = 0
const event = (partial: Partial<TestEvent> & { kind: number }): TestEvent => ({
  id: String(++seq).padStart(64, '0'),
  sig: '',
  pubkey: AUTHOR,
  created_at: 1_700_000_000 + seq,
  tags: [],
  content: '',
  ...partial,
})

const manifest = event({
  kind: 31990,
  tags: [['d', 'some-app'], ['k', String(KIND)]],
  content: JSON.stringify({
    name: 'Some app',
    projections: {
      [KIND]: {
        widget: 'card',
        // `as: 'pubkey'` is what makes the runtime ask who somebody is. Ship's
        // own manifest declares `lead` this way, and without such a slot the
        // people test below would assert nothing.
        slots: { title: { tag: 'title' }, meta: { tag: 'lead', as: 'pubkey' } },
      },
    },
  }),
})
const object = event({ kind: KIND, tags: [['d', 'p1'], ['title', 'A project'], ['lead', AUTHOR]] })
const profile = event({ kind: 0, content: JSON.stringify({ name: 'Ada' }) })

const world = [manifest, object, profile]

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (filters: Record<string, unknown>[]) =>
    world.filter((e) =>
      filters.some((f) => {
        if (f.kinds && !(f.kinds as number[]).includes(e.kind)) return false
        if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false
        for (const [key, want] of Object.entries(f)) {
          if (!key.startsWith('#')) continue
          const held = e.tags.filter((t) => t[0] === key.slice(1)).map((t) => t[1])
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

describe('resolveForeign — who the people are is remembered too (SHA-16)', () => {
  it('does not re-read kind:0 on the next tick', async () => {
    /*
      Ship passed no people lookup, so the default re-read every author of every
      child on every tick. A Ship object has few authors and never noticed; a
      referenced Peek topic has one per message, and cost 2 requests a tick
      where a Ship object cost 1.

      Counted by kind, because the assertion is about *which* request stopped
      happening rather than how many. The first resolve is deliberately not
      asserted on: the cache is at module scope, so an earlier test in this file
      may already have warmed it — which is exactly the sharing it is there for.
    */
    const found = await resolveForeign(ADDRESS)
    // Without this the test is vacuous: nothing looks anybody up unless a slot
    // is declared `as: 'pubkey'`, and then a missing cache would also ask zero.
    expect(found?.slots.meta?.isPubkey).toBe(true)

    query.mockClear()
    await resolveForeign(ADDRESS)

    const profileAsks = query.mock.calls.filter((call) =>
      (call[0] as { kinds?: number[] }[]).some((f) => f.kinds?.includes(0)),
    ).length
    expect(profileAsks).toBe(0)
  })
})

/**
 * A message is an event, not an address — RIC-11.
 *
 * Peek mentions a message as `nostr:nevent…`. Everything here went to
 * `resolveForeignObject`, which throws on that form, and `useForeignObjects`
 * catches the throw into `null` — so the mention drew as twelve characters of
 * bech32 and nothing said why. `resolveForeignEvent` is the runtime's other
 * half (PRO-11), and the fixture above is reused: the same manifest, the same
 * kind, one event of it that is not addressable.
 */
describe('resolveForeign — a message, pointed at by id', () => {
  const MESSAGE_ID = 'c'.repeat(64)
  const message = event({ id: MESSAGE_ID, kind: KIND, tags: [['title', 'Said in passing'], ['lead', AUTHOR]] })

  it('tells an event pointer from an address', () => {
    expect(isEventReference(`nostr:${encodeNevent({ id: MESSAGE_ID, relays: [] })}`)).toBe(true)
    expect(isEventReference('nostr:note1abc')).toBe(true)
    expect(isEventReference(MESSAGE_ID)).toBe(true)
    expect(isEventReference(ADDRESS)).toBe(false)
    expect(isEventReference('nostr:naddr1abc')).toBe(false)
    expect(isEventReference('nostr:npub1abc')).toBe(false)
  })

  it('resolves an nevent through the same manifest an address uses', async () => {
    world.push(message)
    query.mockImplementation(async (filters: Record<string, unknown>[]) =>
      world.filter((e) =>
        filters.some((f) => {
          if (f.ids && !(f.ids as string[]).includes(e.id)) return false
          if (f.kinds && !(f.kinds as number[]).includes(e.kind)) return false
          if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false
          for (const [key, want] of Object.entries(f)) {
            if (!key.startsWith('#')) continue
            const held = e.tags.filter((t) => t[0] === key.slice(1)).map((t) => t[1])
            if (!(want as string[]).some((v) => held.includes(v))) return false
          }
          return true
        }),
      ),
    )
    try {
      const found = await resolveForeign(`nostr:${encodeNevent({ id: MESSAGE_ID, relays: [], kind: KIND })}`)
      expect(found).not.toBeNull()
      expect(found?.eventId).toBe(MESSAGE_ID)
      expect(found?.slots.title?.value).toBe('Said in passing')
      // The people lookup is the cached one, the same as for an address.
      expect(found?.people?.[AUTHOR]?.displayName).toBe('Ada')
    } finally {
      world.pop()
    }
  })

  it('answers null, not a throw, for an event the relay does not hold', async () => {
    await expect(resolveForeign(`nostr:${encodeNevent({ id: 'd'.repeat(64), relays: [], kind: KIND })}`)).resolves.toBeNull()
  })
})
