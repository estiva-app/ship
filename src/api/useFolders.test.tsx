import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FolderSummary } from './foreign'

const readFolders = vi.fn<() => Promise<FolderSummary[]>>()
vi.mock('./foreign', () => ({ readFolders: () => readFolders() }))

const { useFolders } = await import('./useFolders')

const TEAMS: FolderSummary[] = [{ id: 'hq', name: 'Estiva HQ', hasState: true, addresses: ['30850:x:one'] }]

describe('useFolders (FOL-5)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a failed read is read again, and the teams arrive without a reload', async () => {
    vi.useFakeTimers()
    readFolders.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce(TEAMS)
    const { result, rerender } = renderHook(() => useFolders())
    await act(async () => {
      await Promise.resolve()
    })
    // Still coming, not an empty workspace: every project would otherwise
    // draw as unfiled, then regroup when the retry lands.
    expect(result.current).toBeUndefined()
    expect(readFolders).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(readFolders).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual(TEAMS)

    // Held for the tab: a second sidebar mount draws it at once and reads nothing.
    rerender()
    const second = renderHook(() => useFolders())
    expect(second.result.current).toEqual(TEAMS)
    expect(readFolders).toHaveBeenCalledTimes(2)
  })
})
