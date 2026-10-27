// @vitest-environment jsdom
/**
 * What an app link names for a card — SPEC §13.6.2 by §7.7 (OPT-17). The
 * manifests and the relay are stubbed; the rule is real: a declared origin, and
 * the `<type>` and shape against a published pattern, then exactly one author
 * for the `d`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const PK = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const SQUATTER = 'c562b90f3680a8a4bfc1ab3c8b14e0b7c2d1e7b2c1a9e6d0f7b3a4c5d6e7f809'
const D = 'f78c3b96-2a3b-4d92-910a-ac25aba672cd'

const held = vi.hoisted(() => ({ authors: [] as string[], others: [] as { kind: number; pubkey: string }[], queries: 0, refuse: 0 }))

// Each manifest declares `urls` on its own `web` origin only (SPEC §7.7). A wiki reads `/issue/` as its own kind.
const manifest = (web: string, ...urls: string[][]) => ({ kind: 31990, pubkey: 'c'.repeat(64), tags: [['web', web, 'naddr'], ...urls], content: '{}', created_at: 1, id: 'm'.repeat(64), sig: '' })
vi.mock('./handoff', () => ({
  declaredManifests: async () => [
    manifest('https://ship.estiva.app/o/<bech32>', ['urls', 'https://ship.estiva.app/issue/<slug>-<d>#block-<block>', '30851'], ['urls', 'https://ship.estiva.app/m/<id>'], ['k', '30851']),
    manifest('https://leaf.estiva.app/f/<bech32>', ['urls', 'https://leaf.estiva.app/document/<slug>-<d>#block-<block>', '30842']),
    manifest('https://wiki.example/o/<bech32>', ['urls', 'https://wiki.example/issue/<slug>-<d>', '30023']),
  ],
}))
vi.mock('./store', () => ({
  relay: {
    // Answers by kind, as the relay does.
    query: async (filters: { '#d': string[]; kinds?: number[] }[]) => {
      held.queries++
      if (held.refuse > 0 && held.refuse--) throw new Error('rate-limited: too many requests')
      const events = [...held.authors.map((pubkey) => ({ kind: 30851, pubkey })), ...held.others]
      return events.filter((event) => !filters[0].kinds || filters[0].kinds.includes(event.kind)).map((event) => ({ ...event, tags: [['d', filters[0]['#d'][0]]] }))
    },
  },
}))

import { knownLinkValue, useLinkValues } from './linkCards'

const url = (slug: string) => `https://ship.estiva.app/issue/${slug}-${D}`

beforeEach(() => {
  held.queries = 0
  held.others = []
})

describe('a link a card depends on', () => {
  it('names the one object its d resolves to', async () => {
    held.authors = [PK]
    const { result } = renderHook(() => useLinkValues([url('one')]))
    await waitFor(() => expect(result.current.get(url('one'))).toBe(`30851:${PK}:${D}`))
    expect(knownLinkValue(url('one'))).toBe(`30851:${PK}:${D}`)
  })

  it('names nothing when two authors hold the d — nobody can put their card under another’s link', async () => {
    held.authors = [PK, SQUATTER]
    const { result } = renderHook(() => useLinkValues([url('two')]))
    await waitFor(() => expect(held.queries).toBe(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.size).toBe(0)
    expect(knownLinkValue(url('two'))).toBeUndefined()
  })

  it('names the file a link to one of its blocks is in, so the link reads as that file (WBM-11)', async () => {
    held.authors = [PK]
    const block = `${url('three')}#block-0123456789ab`
    const { result } = renderHook(() => useLinkValues([block]))
    await waitFor(() => expect(result.current.get(block)).toBe(`30851:${PK}:${D}`))
  })

  it('names the issue from its path on Leaf’s host, as from Ship’s (LTX-6)', async () => {
    held.authors = [PK]
    const leaf = `https://leaf.estiva.app/issue/six-${D}#block-0123456789ab`
    const { result } = renderHook(() => useLinkValues([leaf]))
    await waitFor(() => expect(result.current.get(leaf)).toBe(`30851:${PK}:${D}`))
  })

  it('looks a path two apps read as different kinds up under both, so a third kind holding its d does not hide it', async () => {
    // On Leaf's host `/issue/` may be Ship's issue or the wiki's page, and nothing else.
    held.authors = []
    held.others = [{ kind: 30023, pubkey: PK }, { kind: 30818, pubkey: SQUATTER }]
    const swapped = `https://leaf.estiva.app/issue/seven-${D}`
    const { result } = renderHook(() => useLinkValues([swapped]))
    await waitFor(() => expect(result.current.get(swapped)).toBe(`30023:${PK}:${D}`))
  })

  it('names the issue after its first read was refused, once the reader says to ask again (ship#340 review)', async () => {
    vi.useFakeTimers()
    try {
      held.authors = [PK]
      held.refuse = 1
      const { result } = renderHook(() => useLinkValues([url('retried')]))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(result.current.size).toBe(0)
      // interop's reader says a failed link may be asked again after 5 s; the hook asks then.
      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(result.current.get(url('retried'))).toBe(`30851:${PK}:${D}`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('names nothing for another host, and asks the relay nothing for it', async () => {
    held.authors = [PK]
    const { result } = renderHook(() => useLinkValues([`https://evil.example/issue/x-${D}`, url('five')]))
    // The link that does resolve answers once the relay was asked, for it alone.
    await waitFor(() => expect(result.current.get(url('five'))).toBe(`30851:${PK}:${D}`))
    expect(result.current.size).toBe(1)
    expect(held.queries).toBe(1)
  })
})
