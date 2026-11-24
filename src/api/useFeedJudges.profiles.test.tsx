import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  What a project page asks the relay for to know who is in it (ALO-19): the
  changes naming anyone with a profile, never every change, the profiles read
  once and shared. The relay is stubbed at its two reads, each answering as the
  relay does (one `query` answers at most its `limit`; `queryAll` pages to the
  end); what is asserted is the filter that goes on the wire.
*/
const ME = 'c'.repeat(64)
const KAT = 'd'.repeat(64)
const FILE = `30850:${'e'.repeat(64)}:6bd072cb-6c30-4883-abb5-faf880d0c444`
const profile = (pubkey: string) => ({ id: pubkey, pubkey, kind: 0, created_at: 1, tags: [], content: '{}', sig: '' }) as SignedEvent

let profiles: SignedEvent[] = []
let profilesFail = false
const answer = (filters: Record<string, unknown>[], paged: boolean): SignedEvent[] => {
  if (!filters.some((f) => (f.kinds as number[]).includes(0))) return []
  if (profilesFail) throw new Error('429')
  const limit = filters.find((f) => (f.kinds as number[]).includes(0))?.limit as number | undefined
  return paged || limit === undefined ? profiles : profiles.slice(0, limit)
}
const query = vi.fn(async (filters: Record<string, unknown>[]) => answer(filters, false))
const queryAll = vi.fn(async (filters: Record<string, unknown>[]) => answer(filters, true))
vi.mock('./store', () => ({
  relay: { query: (f: Record<string, unknown>[]) => query(f), queryAll: (f: Record<string, unknown>[]) => queryAll(f) },
  signer: { pubkey: 'c'.repeat(64) },
}))
vi.mock('./nip44', () => ({ nip44: { decrypt: async () => undefined } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))
vi.mock('@/lib/useRefresh', () => ({ useRefresh: () => {} }))

const { useFeedJudges, resetFeedFactsForTests } = await import('./useFeedJudges')
const { resetProfileKeysForTests } = await import('./profileKeys')

const reads = () => [...query.mock.calls, ...queryAll.mock.calls].flatMap(([filters]) => filters)
const changeFilters = () => reads().filter((f) => (f.kinds as number[]).includes(1851))
const profileReads = () => reads().filter((f) => (f.kinds as number[]).includes(0))

beforeEach(() => {
  resetFeedFactsForTests()
  resetProfileKeysForTests()
  profiles = [profile(ME), profile(KAT)]
  profilesFail = false
  query.mockClear()
  queryAll.mockClear()
})

describe('who is in a project, as the page asks the relay (ALO-19)', () => {
  it('asks for its changes naming anyone with a profile, never every change, and reads the profiles once for two pages', async () => {
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(changeFilters()).toHaveLength(2))
    expect(changeFilters()).toEqual([
      { kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() },
      { kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() },
    ])
    expect(profileReads()).toHaveLength(1)
  })

  it('names the reader too when they have no profile yet, so their own join is read', async () => {
    profiles = [profile(KAT)]
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(changeFilters()).toHaveLength(1))
    expect(changeFilters()).toEqual([{ kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() }])
  })

  it('names everyone in a company of more than 500 people, so nobody past the first page drops out', async () => {
    const many = Array.from({ length: 600 }, (_, i) => i.toString(16).padStart(64, '0'))
    profiles = many.map(profile)
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(changeFilters()).toHaveLength(1))
    expect(changeFilters()[0]['#p']).toEqual([...new Set([ME, ...many])].sort())
  })

  it('reads every change when the profiles cannot be read, rather than miss somebody', async () => {
    profilesFail = true
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(changeFilters()).toHaveLength(1))
    expect(changeFilters()).toEqual([{ kinds: [1851], '#a': [FILE] }])
  })
})
