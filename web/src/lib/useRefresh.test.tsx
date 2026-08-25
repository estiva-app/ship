import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRefresh } from './useRefresh'

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
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
