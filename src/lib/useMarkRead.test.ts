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
    expect(markRead).toHaveBeenLastCalledWith(['thread:a'])
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
