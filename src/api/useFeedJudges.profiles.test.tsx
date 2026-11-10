import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'

/*
  What a project page asks the relay for to know who is in it (ALO-19): the
  changes naming anyone with a profile, never every change, the profiles read
  once and shared. The relay is stubbed at its two reads; what is asserted is
  the filter that goes on the wire.
*/
const ME = 'c'.repeat(64)
const KAT = 'd'.repeat(64)
const FILE = `30850:${'e'.repeat(64)}:6bd072cb-6c30-4883-abb5-faf880d0c444`
const profile = (pubkey: string) => ({ id: pubkey, pubkey, kind: 0, created_at: 1, tags: [], content: '{}', sig: '' }) as SignedEvent

const query = vi.fn(async (_filters: unknown): Promise<SignedEvent[]> => [profile(ME), profile(KAT)])
const queryAll = vi.fn(async (_filters: Record<string, unknown>[]): Promise<SignedEvent[]> => [])
vi.mock('./store', () => ({ relay: { query: (f: unknown) => query(f), queryAll: (f: Record<string, unknown>[]) => queryAll(f) }, signer: { pubkey: 'c'.repeat(64) } }))
vi.mock('./nip44', () => ({ nip44: { decrypt: async () => undefined } }))
vi.mock('../auth/estivaId', () => ({ signedIn: () => true }))
vi.mock('@/lib/useRefresh', () => ({ useRefresh: () => {} }))

const { useFeedJudges, resetFeedFactsForTests } = await import('./useFeedJudges')
const { resetProfileKeysForTests } = await import('./profileKeys')

const changeFilters = () => queryAll.mock.calls.flatMap(([filters]) => filters).filter((f) => (f.kinds as number[]).includes(1851))

beforeEach(() => {
  resetFeedFactsForTests()
  resetProfileKeysForTests()
  query.mockClear()
  queryAll.mockClear()
})

describe('who is in a project, as the page asks the relay (ALO-19)', () => {
  it('asks for its changes naming anyone with a profile, never every change, and reads the profiles once for two pages', async () => {
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(queryAll).toHaveBeenCalledTimes(2))
    expect(changeFilters()).toEqual([
      { kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() },
      { kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() },
    ])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('names the reader too when they have no profile yet, so their own join is read', async () => {
    query.mockResolvedValueOnce([profile(KAT)])
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(queryAll).toHaveBeenCalledTimes(1))
    expect(changeFilters()).toEqual([{ kinds: [1851], '#a': [FILE], '#p': [ME, KAT].sort() }])
  })

  it('reads every change when the profiles cannot be read, rather than miss somebody', async () => {
    query.mockRejectedValueOnce(new Error('429'))
    renderHook(() => useFeedJudges({ addr: FILE, createdAt: 1000 }, undefined))
    await vi.waitFor(() => expect(queryAll).toHaveBeenCalledTimes(1))
    expect(changeFilters()).toEqual([{ kinds: [1851], '#a': [FILE] }])
  })
})
