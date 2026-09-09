/**
 * PER-3 — what Ship guarantees about its socket.
 *
 * The three things worth pinning are the ones that fail quietly: subscribing
 * before there is a Folder set to subscribe to, re-subscribing 34 Folders on
 * every read because the array's identity changed, and turning a burst of
 * events into a burst of full workspace reads.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watchFolders = vi.fn()
const onState = vi.fn(() => () => {})
const stop = vi.fn()
let stateNow = 'live'

const client = {
  state: () => stateNow,
  onState,
  watchFolders,
  subscriptions: {},
  relay: {},
  onFolderActivity: vi.fn(),
  close: vi.fn(),
}

vi.mock('@estiva-app/platform', () => ({
  createLiveClientHolder: () => ({ get: () => client, peek: () => client, reset: () => {} }),
  browserOnlineSource: () => ({ online: () => true, subscribe: () => () => {} }),
}))
vi.mock('@estiva-app/identity', () => ({ signViaEstivaId: vi.fn() }))
vi.mock('../auth/estivaId', () => ({
  currentToken: () => ({ accessToken: 'at', pubkey: 'b3'.repeat(32) }),
}))
vi.mock('../config', () => ({
  RELAY_URL: 'https://relay.test',
  ID_CONFIG: { base: 'https://id.test', clientId: 'estiva-ship' },
}))

import { useLiveWorkspace } from './liveWorkspace'

const FOLDER_A = '11111111-1111-4111-8111-111111111111'
const FOLDER_B = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.useFakeTimers()
  stateNow = 'live'
  watchFolders.mockReset()
  watchFolders.mockReturnValue({ stop })
  stop.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the subscription', () => {
  it('opens nothing until a read has produced a Folder set', () => {
    // Discovery *derives* the Folder list, so before the first read there is
    // genuinely nothing to ask for — and a REQ with no `#h` would be a global
    // subscription, which is a different and much broader thing.
    renderHook(() => useLiveWorkspace([], () => {}))
    expect(watchFolders).not.toHaveBeenCalled()
  })

  it('asks for every Folder in one call, with the workspace kinds named', () => {
    renderHook(() => useLiveWorkspace([FOLDER_A, FOLDER_B], () => {}))
    expect(watchFolders).toHaveBeenCalledTimes(1)
    const [folders, , options] = watchFolders.mock.calls[0]
    expect(folders.sort()).toEqual([FOLDER_A, FOLDER_B].sort())
    // Not kindless: a kindless wide filter is refused outright on one relay
    // build, and naming them keeps an unrelated kind in a shared Folder from
    // waking a full workspace re-read.
    expect(options.kinds).toContain(30851)
    expect(options.kinds).toContain(1851)
  })

  it('does not resubscribe when a read returns the same Folders in a new array', () => {
    // Every read produces a fresh array. Comparing by identity would tear down
    // and rebuild the subscription on every tick, which is a metered REQ each
    // time — 50 unpaced is the production ceiling.
    const { rerender } = renderHook(({ folders }: { folders: string[] }) => useLiveWorkspace(folders, () => {}), {
      initialProps: { folders: [FOLDER_A, FOLDER_B] },
    })
    rerender({ folders: [FOLDER_B, FOLDER_A] })
    rerender({ folders: [FOLDER_A, FOLDER_B] })
    expect(watchFolders).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()
  })

  it('resubscribes when the Folder set actually changes', () => {
    // A re-linked project or a new one genuinely adds a Folder, and an
    // unsubscribed Folder is silent in a way that looks like working.
    const { rerender } = renderHook(({ folders }: { folders: string[] }) => useLiveWorkspace(folders, () => {}), {
      initialProps: { folders: [FOLDER_A] },
    })
    rerender({ folders: [FOLDER_A, FOLDER_B] })
    expect(watchFolders).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('stops the subscription on unmount', () => {
    const { unmount } = renderHook(() => useLiveWorkspace([FOLDER_A], () => {}))
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

describe('a pushed event', () => {
  it('triggers one re-read, debounced, however many events arrive', () => {
    // One gesture in another app is often several events: a status change is a
    // kind:1851, a comment is a kind:1111, and a re-link is both.
    const onChange = vi.fn()
    renderHook(() => useLiveWorkspace([FOLDER_A], onChange))
    const notify = watchFolders.mock.calls[0][1] as (folder: string) => void

    act(() => {
      notify(FOLDER_A)
      notify(FOLDER_A)
      notify(FOLDER_A)
    })
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('drops a pending re-read on unmount rather than reading into a dead component', () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useLiveWorkspace([FOLDER_A], onChange))
    const notify = watchFolders.mock.calls[0][1] as (folder: string) => void
    act(() => notify(FOLDER_A))
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('always calls the latest handler, without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onChange }: { onChange: () => void }) => useLiveWorkspace([FOLDER_A], onChange), {
      initialProps: { onChange: first },
    })
    rerender({ onChange: second })
    const notify = watchFolders.mock.calls[0][1] as (folder: string) => void
    act(() => notify(FOLDER_A))
    act(() => vi.advanceTimersByTime(400))
    expect(watchFolders).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('the reported state', () => {
  it('reports live, which is what stands the poll down', () => {
    const { result } = renderHook(() => useLiveWorkspace([FOLDER_A], () => {}))
    expect(result.current.live).toBe(true)
    expect(result.current.relayState).toBe('live')
  })

  it('is not live while the socket is reconnecting, so the poll comes back', () => {
    stateNow = 'reconnecting'
    const { result } = renderHook(() => useLiveWorkspace([FOLDER_A], () => {}))
    expect(result.current.live).toBe(false)
  })
})
