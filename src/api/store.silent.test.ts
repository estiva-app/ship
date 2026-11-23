// @vitest-environment jsdom
/**
 * A read the relay takes and never answers ends, and says why (SHI-68): forced on production it left Topics on its
 * heading for good, with no "didn't load", no Try again and no report.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({
  ID_CONFIG: { base: 'https://id.estiva.app', clientId: 'estiva-ship' },
  RELAY_URL: 'wss://estiva.estiva.app',
  workspaceLabel: () => 'estiva.estiva.app',
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('a read the relay never answers fails after 20 seconds, and a failure drawn next is reported as not reached', async () => {
  // Takes the request and never answers; ends only when the request's own signal does, as the browser's fetch does.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    ),
  )
  const { relay } = await import('./store')
  const { heardFailures } = await import('../lib/heardFailures')
  let outcome: unknown = 'waiting'
  relay.info().then(
    () => (outcome = 'answered'),
    (error: unknown) => (outcome = error),
  )
  await vi.advanceTimersByTimeAsync(19_000)
  expect(outcome).toBe('waiting')
  await vi.advanceTimersByTimeAsync(1_000)
  expect((outcome as Error).name).toBe('TimeoutError')
  expect(heardFailures.recent()).toBe('not-reached')
})
