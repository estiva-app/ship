import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ profiles: vi.fn() }))

import { profiles } from './index'
import { useDirectory } from './useDirectory'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)

const answer = (pubkeys: string[]) =>
  new Map(pubkeys.map((pubkey) => [pubkey, { pubkey, name: `Name ${pubkey[0]}`, createdAt: 1 }]))

beforeEach(() => {
  vi.mocked(profiles).mockReset()
  vi.mocked(profiles).mockImplementation(async (pubkeys) => answer(pubkeys))
})

describe('useDirectory — names and faces on the old app\'s two-speed rule', () => {
  it('asks for every key on the first screen, then only unseen ones as the poll adds people', async () => {
    const { result, rerender } = renderHook(({ keys, nav }) => useDirectory(keys, nav), {
      initialProps: { keys: [A, B], nav: 'issues' },
    })
    await waitFor(() => expect(result.current.nameOf(A)).toBe('Name a'))
    expect(profiles).toHaveBeenCalledTimes(1)
    expect(profiles).toHaveBeenLastCalledWith([A, B])

    rerender({ keys: [A, B, C], nav: 'issues' })
    await waitFor(() => expect(result.current.nameOf(C)).toBe('Name c'))
    expect(profiles).toHaveBeenCalledTimes(2)
    expect(profiles).toHaveBeenLastCalledWith([C])
  })

  it('re-reads everyone on navigation, so a rename made elsewhere shows on the next screen', async () => {
    const { result, rerender } = renderHook(({ keys, nav }) => useDirectory(keys, nav), {
      initialProps: { keys: [A], nav: 'issues' },
    })
    await waitFor(() => expect(result.current.nameOf(A)).toBe('Name a'))

    vi.mocked(profiles).mockImplementation(async (pubkeys) =>
      new Map(pubkeys.map((pubkey) => [pubkey, { pubkey, name: 'Renamed', createdAt: 2 }])),
    )
    rerender({ keys: [A], nav: 'issue:1' })
    await waitFor(() => expect(result.current.nameOf(A)).toBe('Renamed'))
    expect(profiles).toHaveBeenCalledTimes(2)
  })

  it('shows a shortened key for anyone it has no profile for, and swallows a failed read', async () => {
    vi.mocked(profiles).mockRejectedValue(new Error('relay down'))
    const { result } = renderHook(() => useDirectory([A], 'issues'))
    await waitFor(() => expect(profiles).toHaveBeenCalled())
    expect(result.current.nameOf(A)).toBe('aaaaaaaa…')
    expect(result.current.personOf(A)).toEqual({})
  })

  it('asks nothing when there is nobody to ask about', () => {
    renderHook(() => useDirectory([], 'issues'))
    expect(profiles).not.toHaveBeenCalled()
  })
})
