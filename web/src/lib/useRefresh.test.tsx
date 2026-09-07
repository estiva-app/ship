import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRefresh, REFRESH_MS } from './useRefresh'
import { noteRateLimited, resetRelayBudget } from './relayBudget'

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
  resetRelayBudget()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRefresh — the old app\'s 5-second poll and visibility refresh (REW-6)', () => {
  it('re-reads on the interval while visible, and never on mount', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 5000 }))
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('stops entirely while the tab is hidden — nothing on screen can be stale', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 5000 }))
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reads immediately when the tab becomes visible, then resumes the interval', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 5000 }))
    setVisibility('hidden')
    vi.advanceTimersByTime(600_000)
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('reads on window focus, but one gesture is one read even if two events fire', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 5000 }))
    setVisibility('hidden')
    vi.advanceTimersByTime(30_000)
    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cleans up on unmount: no timer, no listeners left behind', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useRefresh(refresh, { intervalMs: 5000 }))
    unmount()
    vi.advanceTimersByTime(60_000)
    window.dispatchEvent(new Event('focus'))
    setVisibility('hidden')
    setVisibility('visible')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('always calls the latest refresh function, without restarting the timer', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useRefresh(fn, { intervalMs: 5000 }), { initialProps: { fn: first } })
    vi.advanceTimersByTime(3000)
    rerender({ fn: second })
    vi.advanceTimersByTime(2000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('useRefresh — holding off when the relay says it is over budget (SHI-12)', () => {
  /*
    The number is asserted so changing it is deliberate, and the arithmetic is
    here so a future reader can redo it rather than trust it.

    Measured against production 2026-09-07 by counting the transport's calls
    through one real `loadAll`: 38 requests. Buzz meters `POST /query` at 300 a
    minute per pubkey, and a Ship tab and a Peek tab signed in as the same
    person share that one allowance.

      5 s → 12 reads/min → 456 requests  (152% — over)
     10 s →  6 reads/min → 228 requests  ( 76% — no room for a second app)
     20 s →  3 reads/min → 114 requests  ( 38%)

    Revert this to 10_000 once `rawFolders` batches: the same read is 1 request
    and 362 ms when its 34 filters go in one POST, which is how Ship did it
    before `queryAll` was adopted for paging.
  */
  it('polls at twenty seconds, which leaves the relay’s 300-a-minute room for a second app', () => {
    expect(REFRESH_MS).toBe(10_000)
  })

  it('skips ticks while the relay has asked this tab to wait', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 1000 }))

    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)

    noteRateLimited('rate-limited: quota exceeded; retry in 5s')
    vi.advanceTimersByTime(4000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('resumes on the first tick after the wait, not after a further whole interval', () => {
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 1000 }))

    noteRateLimited('rate-limited: quota exceeded; retry in 3s')

    // Ticks at 1 s and 2 s fall inside the wait and are skipped.
    vi.advanceTimersByTime(2000)
    expect(refresh).not.toHaveBeenCalled()

    // The tick at 3 s is the first outside it, and it runs — `lastAt` was never
    // advanced by a skipped tick, so nothing has to wait out a second interval.
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('holds off a tab being looked at again, too — the budget does not care why we asked', () => {
    // visibilitychange and focus both call the same tick. A person switching
    // back to a rate-limited tab must not spend the request that is still
    // refused; they simply see the last good state a moment longer.
    const refresh = vi.fn()
    renderHook(() => useRefresh(refresh, { intervalMs: 1000 }))
    noteRateLimited('rate-limited: quota exceeded; retry in 5s')

    setVisibility('hidden')
    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))

    expect(refresh).not.toHaveBeenCalled()
  })
})
