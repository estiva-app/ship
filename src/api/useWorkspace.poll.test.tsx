import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelayBusyError } from '@estiva-app/protocol'

/*
  The poll's real timer, not a stub of it: `useWorkspace.test.tsx` stubs
  `useRefresh` to test which read runs; this file checks that a read is asked
  again on a tick at all, with the socket live (APP-9).
*/
vi.mock('./index', () => ({ loadAllEvents: vi.fn(), reloadFolders: vi.fn(), foldWorkspace: (read: unknown) => read }))
vi.mock('./liveWorkspace', () => ({ useLiveWorkspace: () => ({ relayState: 'live', live: true }) }))

import { loadAllEvents } from './index'
import { REFRESH_MS } from '../lib/useRefresh'
import { useWorkspace } from './useWorkspace'

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
})
afterEach(() => {
  vi.useRealTimers()
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
