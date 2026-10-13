// @vitest-environment jsdom
/**
 * What an app link names for a card — SPEC §13.6.2 by §7.7 (OPT-17). The
 * manifests and the relay are stubbed; the rule is real: the host and the
 * `<type>` against a published pattern, then exactly one author for the `d`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const PK = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const SQUATTER = 'c562b90f3680a8a4bfc1ab3c8b14e0b7c2d1e7b2c1a9e6d0f7b3a4c5d6e7f809'
const D = 'f78c3b96-2a3b-4d92-910a-ac25aba672cd'

const held = vi.hoisted(() => ({ authors: [] as string[], queries: 0 }))

vi.mock('./handoff', () => ({
  declaredManifests: async () => [
    { kind: 31990, pubkey: 'c'.repeat(64), tags: [['urls', 'https://ship.estiva.app/issue/<slug>-<d>#block-<block>', '30851'], ['k', '30851']], content: '{}', created_at: 1, id: 'm'.repeat(64), sig: '' },
  ],
}))
vi.mock('./store', () => ({
  relay: {
    query: async (filters: { '#d': string[] }[]) => {
      held.queries++
      return held.authors.map((pubkey) => ({ kind: 30851, pubkey, tags: [['d', filters[0]['#d'][0]]] }))
    },
  },
}))

import { knownLinkValue, useLinkValues } from './linkCards'

const url = (slug: string) => `https://ship.estiva.app/issue/${slug}-${D}`

beforeEach(() => {
  held.queries = 0
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

  it('names nothing for another host or a block, and asks the relay nothing for them', async () => {
    held.authors = [PK]
    const block = `${url('three')}#block-0123456789ab`
    const { result } = renderHook(() => useLinkValues([`https://evil.example/issue/x-${D}`, block]))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.size).toBe(0)
    expect(held.queries).toBe(0)
  })
})
