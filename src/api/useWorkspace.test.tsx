import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RelayBusyError } from '@estiva-app/protocol'

// The fold is the identity here, so a test hands the hook a state directly and
// reads it back — what is under test is which read runs, not what it folds to.
vi.mock('./index', () => ({ loadAllEvents: vi.fn(), loadOpened: vi.fn(), reloadFolders: vi.fn(), readThreads: vi.fn(), holdsThreads: vi.fn(), foldWorkspace: (read: unknown) => read }))

/**
 * The socket, stubbed so this file keeps testing the read machinery.
 *
 * `useLiveWorkspace`'s own behaviour is pinned in `liveWorkspace.test.tsx`;
 * what matters here is the wiring — which callback it is handed, and what the
 * poll does with `live`.
 */
const live = { current: false }
const handers: { onChange: ((folders?: string[]) => void) | null; poll?: () => void; watched?: string[] } = { onChange: null }
vi.mock('./liveWorkspace', () => ({
  useLiveWorkspace: (folders: string[], onChange: (folders?: string[]) => void) => {
    handers.onChange = onChange
    handers.watched = folders
    return { relayState: live.current ? 'live' : 'off', live: live.current }
  },
}))

const refreshMock = vi.fn()
vi.mock('../lib/useRefresh', () => ({
  REFRESH_MS: 10_000,
  useRefresh: (fn: () => void, options?: { interval?: boolean }) => {
    refreshMock(options?.interval ?? true)
    handers.poll = fn
  },
}))

import type { WorkspaceEvents, WorkspaceState } from '../nostr/store'

/** With the fold mocked to the identity, a read and the state it folds to are one object. */
type Read = WorkspaceState & WorkspaceEvents
import { holdsThreads, loadAllEvents, loadOpened, readThreads, reloadFolders } from './index'
import { useWorkspace } from './useWorkspace'

/**
 * A workspace holding one project, whose status is whatever the relay held
 * when the read that produced it *started*.
 */
const stateWith = (status: string): Read =>
  ({
    projects: [{ addr: 'p', status }],
    issues: [],
    activity: [],
    conversations: [],
    folders: ['11111111-1111-4111-8111-111111111111'],
  }) as unknown as Read

/** A read that resolves only when the test says so — the 8.8 s one, on demand. */
function pendingRead() {
  let release!: (state: Read) => void
  const promise = new Promise<Read>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const statusOf = (state: WorkspaceState | null) => (state?.projects[0] as { status?: string } | undefined)?.status

beforeEach(() => {
  vi.mocked(loadAllEvents).mockReset()
  vi.mocked(loadOpened).mockReset()
  vi.mocked(reloadFolders).mockReset()
  vi.mocked(readThreads).mockReset()
  // Every read holds the conversations asked for, unless a test says otherwise (APP-5).
  vi.mocked(holdsThreads).mockReset().mockReturnValue(true)
  refreshMock.mockReset()
  live.current = false
  handers.onChange = null
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
    vi.mocked(loadAllEvents).mockReturnValueOnce(poll.promise).mockReturnValueOnce(afterWrite.promise)

    const { result } = renderHook(() => useWorkspace())
    // The mount read is in flight and has not resolved: this is the 8.8 s window.
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    // A write lands, and the page re-reads the way `act` does.
    let settled = false
    const reread = result.current.refresh().then(() => {
      settled = true
    })

    // The re-read must have asked the relay again rather than joining the
    // read already running — that one cannot contain the write.
    expect(loadAllEvents).toHaveBeenCalledTimes(2)

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
    vi.mocked(loadAllEvents).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = renderHook(() => useWorkspace())
    void result.current.refresh()
    expect(loadAllEvents).toHaveBeenCalledTimes(2)

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
    vi.mocked(loadAllEvents).mockReturnValue(inFlight.promise)

    const { result } = renderHook(() => useWorkspace())
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    // A tick while a read is running must be a no-op: two events fire for one
    // gesture, and at ~8.8 s a read is by far the expensive thing in this app.
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    // …and the one read that did run still lands on screen.
    inFlight.release(stateWith('planned'))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('planned'))
    expect(loadAllEvents).toHaveBeenCalledTimes(1)
  })
})

describe('useWorkspace — a quota refusal is a wait, not a broken relay (SHI-12)', () => {
  it('keeps the last good workspace and raises no error banner', async () => {
    vi.mocked(loadAllEvents)
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
    vi.mocked(loadAllEvents).mockRejectedValue(new Error('query failed: relay_membership_required'))

    const { result } = renderHook(() => useWorkspace())

    await waitFor(() => expect(result.current.error).toMatch(/relay_membership_required/))
  })
})

/*
  APP-9: protocol's `Relay.query` throws a `RelayBusyError` once its quiet
  retries run out. That is a wait, like a quota refusal: no red error over a
  workspace that is still correct, and the info banner ("The relay is busy —
  waiting to load the workspace", App.tsx, keyed on `busy`) before there is one.
*/
describe('useWorkspace — a relay that stays busy is a wait, not a broken relay (APP-9)', () => {
  it('keeps the last good workspace on screen with no error banner', async () => {
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('in_progress')).mockRejectedValueOnce(new RelayBusyError(503))

    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(statusOf(result.current.state)).toBe('in_progress'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(statusOf(result.current.state)).toBe('in_progress')
  })

  it('says the relay is busy, not an error, when the first read finds it busy', async () => {
    vi.mocked(loadAllEvents).mockRejectedValue(new RelayBusyError(502))

    const { result } = renderHook(() => useWorkspace())

    await waitFor(() => expect(result.current.busy).toBe(true))
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})

describe('useWorkspace — the socket delivers and the poll becomes a fallback (PER-3)', () => {
  it('stands the poll down while the socket is live', async () => {
    live.current = true
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    // `interval: false` once a read has given the socket its Folders. The poll stops being how anything arrives.
    expect(refreshMock).toHaveBeenLastCalledWith(false)
  })

  it('keeps polling when there is no socket', async () => {
    live.current = false
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
    renderHook(() => useWorkspace())
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(refreshMock).toHaveBeenLastCalledWith(true)
  })

  it('re-reads when a Folder changes, without waiting for a tick', async () => {
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('done'))
    await act(async () => {
      handers.onChange?.()
    })
    await waitFor(() => expect(statusOf(result.current.state)).toBe('done'))
  })

  it('gives the socket a read that always starts fresh, not the coalescing poll', async () => {
    /*
      The Ship #63 shape, reached from the other direction. `poll` joins a read
      already in flight, and a read that began before the pushed event cannot
      contain it — so joining one here would drop somebody else's change until
      the next tick, which is exactly the latency this ticket removes.
    */
    const first = pendingRead()
    vi.mocked(loadAllEvents).mockReturnValueOnce(first.promise)
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(loadAllEvents).toHaveBeenCalledTimes(1))

    // An event arrives while the first read is still outstanding.
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('done'))
    await act(async () => {
      handers.onChange?.()
    })
    // A second read was started rather than the outstanding one joined.
    expect(loadAllEvents).toHaveBeenCalledTimes(2)

    // And the older read landing last does not put the pre-event state back.
    await act(async () => {
      first.release(stateWith('todo'))
    })
    await waitFor(() => expect(statusOf(result.current.state)).toBe('done'))
  })

  describe('re-reading only what changed (PER-17)', () => {
    const FOLDER = '22222222-2222-4222-8222-222222222222'

    it('re-reads only the Folders the socket names', async () => {
      const first = stateWith('todo')
      vi.mocked(loadAllEvents).mockResolvedValue(first)
      const { result } = renderHook(() => useWorkspace())
      await waitFor(() => expect(result.current.state).not.toBeNull())

      vi.mocked(reloadFolders).mockResolvedValue(stateWith('done'))
      await act(async () => {
        handers.onChange?.([FOLDER])
      })
      await waitFor(() => expect(statusOf(result.current.state)).toBe('done'))
      // Scoped to that Folder, from the last read — and no whole re-read.
      expect(reloadFolders).toHaveBeenCalledExactlyOnceWith(first, [FOLDER])
      expect(loadAllEvents).toHaveBeenCalledTimes(1)
    })

    it('scopes a refresh given Folders, and reads everything without them', async () => {
      vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
      const { result } = renderHook(() => useWorkspace())
      await waitFor(() => expect(result.current.state).not.toBeNull())

      vi.mocked(reloadFolders).mockResolvedValue(stateWith('done'))
      await act(() => result.current.refresh([FOLDER]))
      expect(statusOf(result.current.state)).toBe('done')
      expect(loadAllEvents).toHaveBeenCalledTimes(1)

      await act(() => result.current.refresh())
      expect(loadAllEvents).toHaveBeenCalledTimes(2)
    })

    it('starts each scoped read from the one before it', async () => {
      // Side by side, each would keep the other's Folder as it was before
      // either landed — so the second waits and builds on the first.
      vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
      const { result } = renderHook(() => useWorkspace())
      await waitFor(() => expect(result.current.state).not.toBeNull())

      const a = pendingRead()
      const afterA = stateWith('in_progress')
      vi.mocked(reloadFolders).mockReturnValueOnce(a.promise).mockResolvedValueOnce(stateWith('done'))
      let both!: Promise<unknown>
      act(() => {
        both = Promise.all([result.current.refresh(['a']), result.current.refresh(['b'])])
      })
      await waitFor(() => expect(reloadFolders).toHaveBeenCalledTimes(1))
      await act(async () => {
        a.release(afterA)
        await both
      })
      expect(reloadFolders).toHaveBeenLastCalledWith(afterA, ['b'])
      expect(statusOf(result.current.state)).toBe('done')
    })

    it('does not let the poll join a scoped read', async () => {
      // Focus is when the whole workspace is re-read; joining a one-Folder read
      // would skip it.
      vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
      const { result } = renderHook(() => useWorkspace())
      await waitFor(() => expect(result.current.state).not.toBeNull())

      vi.mocked(reloadFolders).mockReturnValueOnce(pendingRead().promise)
      act(() => {
        void result.current.refresh([FOLDER])
      })
      await waitFor(() => expect(reloadFolders).toHaveBeenCalledTimes(1))
      await act(async () => {
        void handers.poll?.()
      })
      expect(loadAllEvents).toHaveBeenCalledTimes(2)
    })
  })

  it('reports live to its caller', async () => {
    live.current = true
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('todo'))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.live).toBe(true))
  })
})

describe('useWorkspace — the opened page draws from its own read first (APP-4)', () => {
  const OPENED = { kind: 'project', d: 'pa' } as const

  it('shows the opened page before the whole read lands, then the whole read', async () => {
    const whole = pendingRead()
    vi.mocked(loadAllEvents).mockReturnValueOnce(whole.promise)
    vi.mocked(loadOpened).mockResolvedValueOnce(stateWith('own'))
    const { result } = renderHook(() => useWorkspace(OPENED))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('own'))
    expect(result.current.partial).toBe(true)
    expect(loadOpened).toHaveBeenCalledWith(OPENED)

    await act(async () => whole.release(stateWith('whole')))
    expect(statusOf(result.current.state)).toBe('whole')
    expect(result.current.partial).toBe(false)
  })

  it('starts the whole read only once the opened page has answered, so the two do not share the connection', async () => {
    const own = pendingRead()
    vi.mocked(loadOpened).mockReturnValueOnce(own.promise)
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('whole'))
    const { result } = renderHook(() => useWorkspace(OPENED))
    await act(async () => {})
    expect(loadAllEvents).not.toHaveBeenCalled()

    await act(async () => own.release(stateWith('own')))
    expect(loadAllEvents).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(statusOf(result.current.state)).toBe('whole'))
  })

  it('still reads the whole workspace when the opened page cannot be read', async () => {
    vi.mocked(loadOpened).mockRejectedValueOnce(new Error('relay answered 500'))
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('whole'))
    const { result } = renderHook(() => useWorkspace(OPENED))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('whole'))
    expect(result.current.error).toBeNull()
  })

  it('never puts the opened read over a whole read that landed first', async () => {
    const own = pendingRead()
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('whole'))
    vi.mocked(loadOpened).mockReturnValueOnce(own.promise)
    const { result } = renderHook(() => useWorkspace(OPENED))
    // Shown the tab before the opened page answered: the poll reads the whole workspace at once.
    act(() => void handers.poll?.())
    await waitFor(() => expect(statusOf(result.current.state)).toBe('whole'))

    await act(async () => own.release(stateWith('own')))
    expect(statusOf(result.current.state)).toBe('whole')
    expect(result.current.partial).toBe(false)
    // …and the opened page's answer does not start a second whole read.
    expect(loadAllEvents).toHaveBeenCalledTimes(1)
  })

  it('watches no Folder live until the whole read lands, so a change there does not restart it', async () => {
    const whole = pendingRead()
    vi.mocked(loadAllEvents).mockReturnValueOnce(whole.promise)
    vi.mocked(loadOpened).mockResolvedValueOnce(stateWith('own'))
    const { result } = renderHook(() => useWorkspace(OPENED))
    await waitFor(() => expect(result.current.partial).toBe(true))
    expect(handers.watched).toEqual([])

    await act(async () => whole.release(stateWith('whole')))
    expect(handers.watched).toEqual(['11111111-1111-4111-8111-111111111111'])
  })

  it('lets a write on the opened page wait for the whole read, then re-reads only its Folder', async () => {
    const FOLDER = '22222222-2222-4222-8222-222222222222'
    const whole = pendingRead()
    vi.mocked(loadAllEvents).mockReturnValueOnce(whole.promise).mockResolvedValue(stateWith('read again'))
    vi.mocked(loadOpened).mockResolvedValueOnce(stateWith('own'))
    vi.mocked(reloadFolders).mockResolvedValueOnce(stateWith('written'))
    const { result } = renderHook(() => useWorkspace(OPENED))
    await waitFor(() => expect(result.current.partial).toBe(true))

    let wrote!: Promise<void>
    act(() => {
      wrote = result.current.refresh([FOLDER])
    })
    const first = stateWith('whole')
    await act(async () => {
      whole.release(first)
      await wrote
    })
    // One whole read, not a second one started by the write and thrown away by it.
    expect(loadAllEvents).toHaveBeenCalledTimes(1)
    expect(reloadFolders).toHaveBeenCalledExactlyOnceWith(first, [FOLDER])
    expect(statusOf(result.current.state)).toBe('written')
  })

  it('reads only the whole workspace when the tab opens on any other page', async () => {
    vi.mocked(loadAllEvents).mockResolvedValue(stateWith('whole'))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    expect(loadOpened).not.toHaveBeenCalled()
  })
})

describe('useWorkspace — conversations are read for the screen that draws them (APP-5)', () => {
  const FOLDER = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const WANTED = { folders: [FOLDER], about: ['30851:x:i'] }
  // A whole read brings no conversation the screen wants; `readThreads` brings them.
  const holdsIfThreaded = (read: unknown) => statusOf(read as WorkspaceState) === 'with threads'

  it('asks each Folder the screen wants for its conversation, and no other', async () => {
    const whole = pendingRead()
    vi.mocked(loadAllEvents).mockReturnValueOnce(whole.promise)
    const { result } = renderHook(() => useWorkspace())
    act(() => result.current.wantThreads?.(WANTED))
    const asks = vi.mocked(loadAllEvents).mock.calls[0][0] as ((folder: string) => boolean) | undefined
    expect([asks?.(FOLDER), asks?.(OTHER)]).toEqual([true, false])
    await act(async () => whole.release(stateWith('whole')))
  })

  it('never draws a whole read without the conversations the screen draws, so a poll does not empty them', async () => {
    vi.mocked(holdsThreads).mockImplementation(holdsIfThreaded)
    const whole = pendingRead()
    const first = stateWith('whole')
    vi.mocked(loadAllEvents).mockReturnValueOnce(whole.promise)
    vi.mocked(readThreads).mockResolvedValueOnce(stateWith('with threads'))
    const seen: (string | undefined)[] = []
    const { result } = renderHook(() => {
      const workspace = useWorkspace()
      seen.push(statusOf(workspace.state))
      return workspace
    })
    act(() => result.current.wantThreads?.(WANTED))

    await act(async () => whole.release(first))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('with threads'))
    expect(readThreads).toHaveBeenCalledExactlyOnceWith(first, WANTED)
    expect(seen).not.toContain('whole')
  })

  it('leaves a screen asked for during a whole read to that read, rather than throwing it away', async () => {
    vi.mocked(holdsThreads).mockImplementation(holdsIfThreaded).mockReturnValueOnce(true)
    const poll = pendingRead()
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('whole')).mockReturnValueOnce(poll.promise)
    vi.mocked(readThreads).mockResolvedValue(stateWith('with threads'))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(statusOf(result.current.state)).toBe('whole'))

    act(() => void result.current.refresh())
    act(() => result.current.wantThreads?.(WANTED))
    expect(readThreads).not.toHaveBeenCalled()
    // The read that was running lands — say, without a Folder this reader lost — and brings the screen's own.
    const polled = stateWith('polled')
    await act(async () => poll.release(polled))
    await waitFor(() => expect(statusOf(result.current.state)).toBe('with threads'))
    expect(readThreads).toHaveBeenCalledExactlyOnceWith(polled, WANTED)
  })

  it('reads a screen asked for after the whole read once, however often it draws', async () => {
    // No screen asked yet, so the whole read lands as it is; after it, only `readThreads` brings them.
    vi.mocked(holdsThreads).mockImplementation(holdsIfThreaded).mockReturnValueOnce(true)
    vi.mocked(loadAllEvents).mockResolvedValueOnce(stateWith('whole'))
    const threads = pendingRead()
    vi.mocked(readThreads).mockReturnValueOnce(threads.promise)
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(statusOf(result.current.state)).toBe('whole'))

    act(() => result.current.wantThreads?.(WANTED))
    act(() => result.current.wantThreads?.(WANTED))
    await waitFor(() => expect(readThreads).toHaveBeenCalledTimes(1))
    await act(async () => threads.release(stateWith('with threads')))
    expect(statusOf(result.current.state)).toBe('with threads')
    expect(readThreads).toHaveBeenCalledTimes(1)
  })
})
