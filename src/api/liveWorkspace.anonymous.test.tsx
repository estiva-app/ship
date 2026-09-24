/**
 * A build with no sign-in has no socket, and that is correct rather than
 * degraded.
 *
 * `ID_CONFIG` is `null` whenever `ID_BASE` is empty — local builds are this by
 * default, so a local build cannot reach production identity by accident. The
 * relay refuses a `REQ` before auth outright, so a socket there would connect,
 * fail to authenticate, and retry forever. Polling is the whole mechanism, and
 * `relayState: 'off'` is how the caller knows not to stand the poll down.
 *
 * Its own file because the config mock has to differ from the signed-in one,
 * and a `vi.doMock` racing a module-scope holder is a worse thing to read.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('@estiva-app/platform', () => ({
  // Referenced lazily, not captured. `vi.mock` factories are hoisted above the
  // `const` above, so `{ get }` here dereferences it before initialization —
  // which fails at import with "Cannot access 'get' before initialization"
  // rather than as a test failure.
  createLiveClientHolder: () => ({
    get: (...args: unknown[]) => get(...args),
    peek: () => null,
    reset: () => {},
  }),
  browserOnlineSource: () => ({ online: () => true, subscribe: () => () => {} }),
}))
vi.mock('@estiva-app/identity', () => ({ signViaEstivaId: vi.fn() }))
vi.mock('../auth/estivaId', () => ({ currentToken: () => null }))
vi.mock('../config', () => ({ RELAY_URL: 'https://relay.test', ID_CONFIG: null }))

import { useLiveWorkspace } from './liveWorkspace'

describe('a build with no Estiva ID', () => {
  it('opens no socket and reports off', () => {
    const { result } = renderHook(() =>
      useLiveWorkspace(['11111111-1111-4111-8111-111111111111'], () => {}),
    )
    expect(result.current.relayState).toBe('off')
    expect(result.current.live).toBe(false)
  })

  it('never even builds a client', () => {
    // Not "builds one and fails to connect". There is nothing to authenticate
    // with, so there is nothing to try.
    renderHook(() => useLiveWorkspace(['11111111-1111-4111-8111-111111111111'], () => {}))
    expect(get).not.toHaveBeenCalled()
  })

  it('leaves the poll running, because it is the only mechanism', () => {
    const { result } = renderHook(() =>
      useLiveWorkspace(['11111111-1111-4111-8111-111111111111'], () => {}),
    )
    // `useWorkspace` passes `interval: !live`, so `live: false` here is what
    // keeps the timer on.
    expect(result.current.live).toBe(false)
  })
})
