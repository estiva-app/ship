// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const markRead = vi.fn()
vi.mock('@/api', () => ({ markRead: (...a: unknown[]) => markRead(...a), READ_DWELL_MS: 1500 }))

const { useMarkRead, newestDrawn } = await import('./useMarkRead')

// SHI-38 (was 0aef8178): the mark was stamped once per set of contexts, so a reply that arrived while the
// thread was open — somebody's, or your own — stayed new until the page was opened again. Peek re-arms (PEE-44).
describe('a message drawn while the page is open is read too', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    markRead.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('runs the dwell again when a newer message is drawn', () => {
    const { rerender } = renderHook(({ at }) => useMarkRead(['thread:a'], at), { initialProps: { at: 1000 } })
    vi.advanceTimersByTime(1500)
    expect(markRead).toHaveBeenCalledTimes(1)

    rerender({ at: 1000 })
    vi.advanceTimersByTime(1500)
    expect(markRead).toHaveBeenCalledTimes(1)

    rerender({ at: 1010 })
    vi.advanceTimersByTime(1499)
    expect(markRead).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(markRead).toHaveBeenCalledTimes(2)
    // Up to the newest drawn, not the clock: a reply the poll has not drawn yet stays new.
    expect(markRead).toHaveBeenLastCalledWith(['thread:a'], 1_010_000)
  })

  it('marks nothing while the tab is hidden, and reads it once shown', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    renderHook(() => useMarkRead(['thread:a'], 1000))
    vi.advanceTimersByTime(5000)
    expect(markRead).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(1500)
    expect(markRead).toHaveBeenCalledTimes(1)
    hidden.mockRestore()
  })

  it('reads a message from a clock running ahead once the clock gets there', () => {
    const ahead = Math.floor(Date.now() / 1000) + 20
    renderHook(() => useMarkRead(['thread:a'], ahead))
    vi.advanceTimersByTime(1500)
    expect(markRead).toHaveBeenCalledTimes(1)
    expect(markRead.mock.calls[0][1]).toBeLessThan(ahead * 1000)
    vi.advanceTimersByTime(20_000)
    expect(markRead).toHaveBeenLastCalledWith(['thread:a'], ahead * 1000)
  })
})

describe('newestDrawn', () => {
  const c = (id: string, rootAt: number, replies: number[]) => ({ id, root: { createdAt: rootAt }, replies: replies.map((createdAt) => ({ createdAt })) })

  it('takes the newest root of the feed and the newest reply of the open threads only', () => {
    const feed = [c('t1', 100, [300]), c('t2', 200, [900])]
    expect(newestDrawn(feed, ['t1'])).toEqual({ rootsAt: 200, repliesAt: 300 })
    expect(newestDrawn(feed, [])).toEqual({ rootsAt: 200, repliesAt: undefined })
  })
})
