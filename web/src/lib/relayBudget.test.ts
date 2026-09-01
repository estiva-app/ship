import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_BACKOFF_MS,
  isRateLimited,
  noteRateLimited,
  pausedForMs,
  resetRelayBudget,
  retryHintMs,
} from './relayBudget'

const REFUSAL = '{"error":"rate-limited: quota exceeded; retry in 10s"}'

beforeEach(resetRelayBudget)

describe('relayBudget — the relay says how long to wait, and it is the only one who knows', () => {
  it('reads the relay’s own hint rather than picking a number', () => {
    expect(retryHintMs(REFUSAL)).toBe(10_000)
    // The hint is the remaining window, so it varies with where in the minute
    // the refusal landed. Parsed, never assumed.
    expect(retryHintMs('rate-limited: quota exceeded; retry in 4s')).toBe(4_000)
    expect(retryHintMs('rate-limited: quota exceeded')).toBeUndefined()
  })

  it('falls back to a fixed wait when the relay refuses without saying for how long', () => {
    const waited = noteRateLimited('rate-limited: quota exceeded', 1_000)
    expect(waited).toBe(DEFAULT_BACKOFF_MS)
  })

  it('pauses for exactly what was asked, then stops pausing', () => {
    noteRateLimited(REFUSAL, 1_000)
    expect(pausedForMs(1_000)).toBe(10_000)
    expect(pausedForMs(6_000)).toBe(5_000)
    expect(pausedForMs(11_000)).toBe(0)
    expect(pausedForMs(60_000)).toBe(0)
  })

  it('extends a pause but never shortens one', () => {
    /*
      Three readers share the tick, so several can be refused inside the same
      second — and a later answer carries a *smaller* remaining window, because
      the minute has moved on. Taking the smaller one would resume early and be
      refused again immediately.
    */
    noteRateLimited('rate-limited: quota exceeded; retry in 30s', 1_000)
    noteRateLimited('rate-limited: quota exceeded; retry in 2s', 1_000)
    expect(pausedForMs(1_000)).toBe(30_000)
  })

  it('tells a quota refusal apart from any other failure', () => {
    expect(isRateLimited(REFUSAL)).toBe(true)
    expect(isRateLimited('relay_membership_required')).toBe(false)
    expect(isRateLimited('{"error":"invalid type: map, expected a sequence"}')).toBe(false)
  })
})
