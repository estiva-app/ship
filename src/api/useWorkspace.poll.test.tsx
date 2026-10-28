import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelayBusyError } from '@estiva-app/protocol'

/*
  The poll's real timer, not a stub of it: `useWorkspace.test.tsx` stubs
  `useRefresh` to test which read runs; this file checks that a read is asked
  again on a tick at all, with the socket live (APP-9).
*/
vi.mock('./index', () => ({
  loadAllEvents: vi.fn(),
  loadOpened: vi.fn(),
  reloadFolders: vi.fn(),
  readThreads: vi.fn(),
  holdsThreads: () => true,
  foldWorkspace: (read: unknown) => read,
}))
vi.mock('./liveWorkspace', () => ({ useLiveWorkspace: () => ({ relayState: 'live', live: true }) }))

import { loadAllEvents, loadOpened } from './index'
import { REFRESH_MS } from '../lib/useRefresh'
import { noteRateLimited, resetRelayBudget } from '../lib/relayBudget'
import { useWorkspace } from './useWorkspace'

const QUOTA = 'rate-limited: quota exceeded; retry in 11s'

/** A read the relay refused on quota, recorded as the transport records every 429. */
async function refusedOnQuota(): Promise<never> {
  noteRateLimited(QUOTA)
  throw new Error(QUOTA)
}

const workspace = (folders: string[]) => ({ projects: [{ addr: 'p', status: 'todo' }], issues: [], activity: [], conversations: [], folders })

/** Let the read's promise chain settle, then move the clock. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(loadAllEvents).mockReset()
  vi.mocked(loadOpened).mockReset()
})
afterEach(() => {
  resetRelayBudget()
  vi.useRealTimers()
})

describe('useWorkspace — a first read refused on quota asks again when the wait ends (APP-4)', () => {
  // Measured on production, 28 Oct: refused 1.3 s in with "retry in 11s", the project drew at 24.9 s — the
  // poll's first tick after the pause, a whole interval past the relay's wait.
  it('draws the workspace once the relay says it may, not on the next tick after', async () => {
    vi.mocked(loadAllEvents)
      .mockImplementationOnce(refusedOnQuota)
      .mockResolvedValue(workspace(['11111111-1111-4111-8111-111111111111']) as never)

    const { result } = renderHook(() => useWorkspace())
    await tick(0)
    expect(result.current.busy).toBe(true)

    await tick(11_500)
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    await tick(600)
    expect(loadAllEvents).toHaveBeenCalledTimes(2)
    expect(result.current.state?.projects).toHaveLength(1)
  })

  it('draws the opened project from its own Folder once the wait ends, while the whole read is still out', async () => {
    vi.mocked(loadOpened)
      .mockImplementationOnce(refusedOnQuota)
      .mockResolvedValue(workspace(['22222222-2222-4222-8222-222222222222']) as never)
    vi.mocked(loadAllEvents).mockImplementationOnce(refusedOnQuota).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useWorkspace({ kind: 'project', d: 'p' }))
    await tick(0)
    expect(result.current.state).toBeNull()

    await tick(12_100)
    expect(loadOpened).toHaveBeenCalledTimes(2)
    expect(result.current.partial).toBe(true)
    expect(result.current.state?.projects).toHaveLength(1)
  })

  it('does not ask again in a hidden tab, and reads when the tab is shown', async () => {
    vi.mocked(loadAllEvents)
      .mockImplementationOnce(refusedOnQuota)
      .mockResolvedValue(workspace(['11111111-1111-4111-8111-111111111111']) as never)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const { result } = renderHook(() => useWorkspace())
    await tick(0)
    await tick(REFRESH_MS * 3)
    expect(loadAllEvents).toHaveBeenCalledTimes(1)

    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await tick(0)
    expect(result.current.state?.projects).toHaveLength(1)
    visibility.mockRestore()
  })

  it('leaves a relay that is busy, not over quota, to the poll', async () => {
    vi.mocked(loadAllEvents).mockRejectedValueOnce(new RelayBusyError(503)).mockResolvedValue(workspace([]) as never)

    renderHook(() => useWorkspace())
    await tick(0)
    await tick(REFRESH_MS - 100)
    expect(loadAllEvents).toHaveBeenCalledTimes(1)
  })
})

describe('useWorkspace — a socket that watches no Folder leaves the poll on (APP-9)', () => {
  // Measured on production: the socket was already live for the sidebar, so the poll stood down and the busy
  // banner stayed for 131 s after the relay had recovered.
  it('asks again on the next tick when the first read found the relay busy, and draws the workspace', async () => {
    vi.mocked(loadAllEvents)
      .mockRejectedValueOnce(new RelayBusyError(503))
      .mockResolvedValue(workspace(['11111111-1111-4111-8111-111111111111']) as never)

    const { result } = renderHook(() => useWorkspace())
    await tick(0)
    expect(result.current.busy).toBe(true)

    await tick(REFRESH_MS)
    expect(loadAllEvents).toHaveBeenCalledTimes(2)
    expect(result.current.busy).toBe(false)
    expect(result.current.state?.projects).toHaveLength(1)

    // Once the socket has Folders to deliver, the poll stands down.
    await tick(REFRESH_MS * 3)
    expect(loadAllEvents).toHaveBeenCalledTimes(2)
  })

  it('keeps asking when the read found no Folder for the socket to watch', async () => {
    vi.mocked(loadAllEvents).mockResolvedValue(workspace([]) as never)

    renderHook(() => useWorkspace())
    await tick(0)
    await tick(REFRESH_MS)
    expect(loadAllEvents).toHaveBeenCalledTimes(2)
  })
})
