import { RELAY_URL } from '../config'

/**
 * The relay refuses an event whose `created_at` is more than roughly fifteen
 * minutes from its own clock. Checked here, before anything is signed, so a
 * wrong clock is said in words rather than arriving as a generic rejection
 * (REW-5).
 *
 * The relay's `date` response header is its clock; CORS exposes it. A check
 * that cannot be made (no network, no header) does not block a write — the
 * relay will answer for itself — and a result is kept for five minutes so a
 * burst of writes costs one request.
 */
const LIMIT_MS = 10 * 60 * 1000
/**
 * A read is signed too (NIP-98), and the relay allows its signature only
 * ±60 s — so a clock off by more than that fails every read before any write
 * is tried, and the read's failure is what a person sees (SHI-53).
 */
export const READ_LIMIT_MS = 60 * 1000
const REMEMBER_MS = 5 * 60 * 1000

let known: { skewMs: number; at: number } | null = null

/** Local clock minus the relay's, in milliseconds; `null` when unknown. */
export async function relayClockSkew(now = Date.now()): Promise<number | null> {
  if (known && now - known.at < REMEMBER_MS) return known.skewMs
  try {
    const response = await fetch(RELAY_URL, { method: 'GET', cache: 'no-store' })
    const header = response.headers.get('date')
    if (!header) return null
    const relayMs = Date.parse(header)
    if (Number.isNaN(relayMs)) return null
    known = { skewMs: now - relayMs, at: now }
    return known.skewMs
  } catch {
    return null
  }
}

/** Forget a remembered skew — for tests, and after a sign-in changes the relay. */
export function forgetClockSkew() {
  known = null
}

/**
 * `null` when it is safe to sign; otherwise the sentence to show instead of
 * publishing. A skew the relay would still accept passes.
 */
export async function clockProblem(limitMs = LIMIT_MS): Promise<string | null> {
  const skew = await relayClockSkew()
  if (skew === null || Math.abs(skew) <= limitMs) return null
  const minutes = Math.max(1, Math.round(Math.abs(skew) / 60_000))
  const direction = skew > 0 ? 'ahead of' : 'behind'
  return `This computer's clock is ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${direction} the relay's — the relay would refuse anything signed now. Set the clock and try again.`
}

/**
 * The clock sentence for a read that just failed, or `null` when the clock is
 * not why. Measured afresh: a remembered skew may predate the clock changing.
 */
export async function readClockProblem(): Promise<string | null> {
  forgetClockSkew()
  return clockProblem(READ_LIMIT_MS)
}
