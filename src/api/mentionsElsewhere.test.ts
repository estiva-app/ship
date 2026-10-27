// @vitest-environment jsdom
/**
 * Mentioned in's read across the relay (PEEKM-7) runs again when the workspace
 * does, which is every live change: a burst of them must cost one more relay
 * read, not one each, or an open issue page eats the person's request budget.
 */
import { act, renderHook } from '@testing-library/react'
import type { SignedEvent } from '@estiva-app/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '../nostr/store'

const relay = vi.hoisted(() => ({ reads: [] as { addr: string; answer: (events: SignedEvent[]) => void }[] }))
vi.mock('./store', () => ({
  store: {
    mentionThreads: (addr: string) => new Promise<SignedEvent[]>((answer) => relay.reads.push({ addr, answer })),
  },
}))

const { useMentionsElsewhere } = await import('./mentionsElsewhere')

const ISSUE = `30851:${'a'.repeat(64)}:the-issue`
const OTHER = `30851:${'a'.repeat(64)}:another`
const workspace = () => ({ folders: ['f'] }) as unknown as WorkspaceState

beforeEach(() => {
  vi.useFakeTimers()
  relay.reads = []
})
afterEach(() => vi.useRealTimers())

describe('useMentionsElsewhere (PEEKM-7)', () => {
  it('reads once while ten workspace refreshes arrive, and once more after the gap', async () => {
    const { rerender } = renderHook(({ state }) => useMentionsElsewhere(ISSUE, state), { initialProps: { state: workspace() } })
    await act(async () => vi.advanceTimersByTime(0))
    expect(relay.reads).toHaveLength(1)
    for (let n = 0; n < 10; n++) rerender({ state: workspace() })
    await act(async () => relay.reads[0].answer([]))
    await act(async () => vi.advanceTimersByTime(14_000))
    expect(relay.reads).toHaveLength(1)
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(relay.reads).toHaveLength(2)
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(relay.reads).toHaveLength(2)
  })

  it('reads a newly opened file once the read still out for the last one has answered', async () => {
    const { rerender } = renderHook(({ addr }) => useMentionsElsewhere(addr, workspace()), { initialProps: { addr: ISSUE } })
    await act(async () => vi.advanceTimersByTime(0))
    rerender({ addr: OTHER })
    await act(async () => relay.reads[0].answer([]))
    await act(async () => vi.advanceTimersByTime(0))
    expect(relay.reads.map((r) => r.addr)).toEqual([ISSUE, OTHER])
  })

  it("reads again at once after the person's own edit, past the gap, and straight after a read still out", async () => {
    const { result } = renderHook(() => useMentionsElsewhere(ISSUE, workspace()))
    await act(async () => vi.advanceTimersByTime(0))
    await act(async () => relay.reads[0].answer([]))
    act(() => result.current.reread())
    await act(async () => vi.advanceTimersByTime(0))
    expect(relay.reads).toHaveLength(2)
    // The edit lands while that read is still out, which may have missed it: one more, now, not after the gap.
    act(() => result.current.reread())
    await act(async () => relay.reads[1].answer([]))
    await act(async () => vi.advanceTimersByTime(0))
    expect(relay.reads).toHaveLength(3)
  })
})
