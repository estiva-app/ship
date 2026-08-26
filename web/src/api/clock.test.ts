import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clockProblem, forgetClockSkew, relayClockSkew } from './clock'

const NOW = Date.parse('2026-08-28T10:00:00Z')

const relaySays = (iso: string | null) =>
  vi.fn().mockResolvedValue({ headers: { get: (name: string) => (name === 'date' && iso ? new Date(iso).toUTCString() : null) } })

beforeEach(() => {
  forgetClockSkew()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the relay clock check', () => {
  it('measures the skew from the relay\'s date header', async () => {
    vi.stubGlobal('fetch', relaySays('2026-08-28T09:58:00Z'))
    expect(await relayClockSkew()).toBe(2 * 60_000)
  })

  it('lets a small skew through, refuses a large one in words, either way round', async () => {
    vi.stubGlobal('fetch', relaySays('2026-08-28T09:55:00Z'))
    expect(await clockProblem()).toBeNull()
    forgetClockSkew()
    vi.stubGlobal('fetch', relaySays('2026-08-28T09:40:00Z'))
    expect(await clockProblem()).toMatch(/20 minutes ahead of the relay/)
    forgetClockSkew()
    vi.stubGlobal('fetch', relaySays('2026-08-28T10:25:00Z'))
    expect(await clockProblem()).toMatch(/25 minutes behind the relay/)
  })

  it('does not block a write when the check cannot be made', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await clockProblem()).toBeNull()
    vi.stubGlobal('fetch', relaySays(null))
    expect(await clockProblem()).toBeNull()
  })

  it('remembers a measurement for five minutes', async () => {
    const fetch = relaySays('2026-08-28T10:00:00Z')
    vi.stubGlobal('fetch', fetch)
    await relayClockSkew()
    await relayClockSkew()
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(NOW + 6 * 60_000)
    await relayClockSkew()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
