import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ loadAll: vi.fn() }))

import type { WorkspaceState } from '../../../src/store'
import { loadAll } from './index'
import { useWorkspace } from './useWorkspace'

/**
 * A workspace holding one project, whose status is whatever the relay held
 * when the read that produced it *started*.
 */
const stateWith = (status: string): WorkspaceState =>
  ({ projects: [{ addr: 'p', status }], issues: [], activity: [], conversations: [] }) as unknown as WorkspaceState

/** A read that resolves only when the test says so — the 8.8 s one, on demand. */
function pendingRead() {
  let release!: (state: WorkspaceState) => void
  const promise = new Promise<WorkspaceState>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const statusOf = (state: WorkspaceState | null) => (state?.projects[0] as { status?: string } | undefined)?.status

beforeEach(() => {
  vi.mocked(loadAll).mockReset()
})

describe('useWorkspace — a read a write is waiting on must have begun after the write', () => {
  /*
    The bug this pins (Ship #63): `loadAll` against production took ~8.8 s and
    the poll ran every 5 s, so a read was in flight roughly 90% of the time. A
    click that landed in that window awaited the *poll's* read, which had begun
    before the write — so it resolved with the old status and the select snapped
    back. The user clicked six times in 22 seconds and filed it as broken; every
    one of those six writes was on the relay the whole time.
  */
  it('does not resolve a post-write re-read from a read that started earlier', async () => {
    const poll = pendingRead()
    const afterWrite = pendingRead()
    vi.mocked(loadAll).mockReturnValueOnce(poll.promise).mockReturnValueOnce(afterWrite.promise)

    const { result } = renderHook(() => useWorkspace())
    // The mount read is in flight and has not resolved: this is the 8.8 s window.
    expect(loadAll).toHaveBeenCalledTimes(1)

    // A write lands, and the page re-reads the way `act` does.
    let settled = false
    const reread = result.current.refresh().then(() => {
      settled = true
    })

    // The re-read must have asked the relay again rather than joining the
    // read already running — that one cannot contain the write.
    expect(loadAll).toHaveBeenCalledTimes(2)

    // The earlier read finishing must not settle the write's re-read.
    await act(async () => {
      poll.release(stateWith('planned'))
      await poll.promise
    })
    expect(settled).toBe(false)

    afterWrite.release(stateWith('in_progress'))
    await reread
    expect(settled).toBe(true)
    await waitFor(() => expect(statusOf(result.current.state)).toBe('in_progress'))
  })

  it('keeps the newer read when an older one resolves last, so state never goes backwards', async () => {
    const first = pendingRead()
    const second = pendingRead()
    vi.mocked(loadAll).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = renderHook(() => useWorkspace())
    void result.current.refresh()
    expect(loadAll).toHaveBeenCalledTimes(2)

    second.release(stateWith('in_progress'))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('in_progress'))

    // The slow first read lands afterwards carrying pre-write state. Applying
    // it would put "Planned" back on screen with nothing left to correct it.
    // `act` so the assertion sees a flushed render: without it this passes
    // whether or not the state was overwritten, which is no test at all.
    await act(async () => {
      first.release(stateWith('planned'))
      await first.promise
    })
    expect(statusOf(result.current.state)).toBe('in_progress')
  })

  it('still lets the poll join a read already running, rather than stacking 8.8 s reads', async () => {
    const inFlight = pendingRead()
    vi.mocked(loadAll).mockReturnValue(inFlight.promise)

    const { result } = renderHook(() => useWorkspace())
    expect(loadAll).toHaveBeenCalledTimes(1)

    // A tick while a read is running must be a no-op: two events fire for one
    // gesture, and at ~8.8 s a read is by far the expensive thing in this app.
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(loadAll).toHaveBeenCalledTimes(1)

    // …and the one read that did run still lands on screen.
    inFlight.release(stateWith('planned'))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('planned'))
    expect(loadAll).toHaveBeenCalledTimes(1)
  })
})

describe('useWorkspace — a quota refusal is a wait, not a broken relay (SHI-12)', () => {
  it('keeps the last good workspace and raises no error banner', async () => {
    vi.mocked(loadAll)
      .mockResolvedValueOnce(stateWith('in_progress'))
      .mockRejectedValueOnce(new Error('query failed: rate-limited: quota exceeded; retry in 10s'))

    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(statusOf(result.current.state)).toBe('in_progress'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.error).toBeNull()
    expect(statusOf(result.current.state)).toBe('in_progress')
  })

  it('still reports a refusal that a person could act on', async () => {
    vi.mocked(loadAll).mockRejectedValue(new Error('query failed: relay_membership_required'))

    const { result } = renderHook(() => useWorkspace())

    await waitFor(() => expect(result.current.error).toMatch(/relay_membership_required/))
  })
})
