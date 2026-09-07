/**
 * How long the relay has asked this tab to wait (SHI-12).
 *
 * Buzz meters `POST /query` against `human_api_calls_per_min` — a fixed
 * 60-second window, default **300**, applied to every bridge call whatever tier
 * the caller is (`enforce_http_admission`, `api/bridge.rs`). Ship's readers are
 * well inside that at rest — 26 requests a minute with an issue page open.
 *
 * A full read used to cost one request per Folder, so the ceiling fell as the
 * workspace grew and no interval chosen on any given day stayed right. Protocol
 * 0.15.0 batches every filter's first page into one request, so it does not any
 * more: measured against production, 39 requests to 3.
 *
 * This module is still the part that holds when headroom runs out, for the
 * reason that did not change — **the budget is shared** across every tab and
 * tool signed in as the same key, so Ship can be well inside its own share and
 * still be refused. The relay says exactly how long to wait —
 * `rate-limited: quota exceeded; retry in 10s` — and it is the only participant
 * that knows, since the budget is shared across every tab and tool signed in as
 * the same key.
 *
 * ## Why the transport reports and the cadence honours
 *
 * Three readers poll on `useRefresh` — the workspace, the read-state frontier
 * and the foreign-reference widgets — and each swallows its own errors,
 * reasonably: none of them wants a failed poll to blank the screen. That means
 * no single reader can see that the *tab* is over budget, and a fix in any one
 * of them leaves the other two spending.
 *
 * One module, written by the transport (which sees every 429) and read by the
 * shared cadence (which is what every poller already goes through), covers all
 * three without any of them knowing about quotas.
 *
 * **A person's own action is deliberately not paused.** `act` re-reads through
 * `Workspace.refresh` directly rather than through `useRefresh`, so a write
 * still shows its result at once. Backing off a poll costs freshness nobody
 * asked for; backing off a click costs the thing they just did.
 */

/** Epoch ms until which polling should hold off. */
let pausedUntil = 0

/**
 * The relay's own hint, in ms, or `undefined` if it did not give one.
 *
 * Buzz formats it as `retry in {n}s` (`connection.rs`, `api/bridge.rs`). Parsed
 * rather than assumed because the number is the relay's remaining *window*, not
 * a fixed penalty — it shrinks as the minute rolls on, and waiting a flat
 * interval instead would either spend early or idle long.
 */
export function retryHintMs(reason: string): number | undefined {
  const found = /retry in (\d+)\s*s/i.exec(reason)
  if (!found) return undefined
  return Number(found[1]) * 1000
}

/** How long to wait when the relay refuses without saying for how long. */
export const DEFAULT_BACKOFF_MS = 30_000

/**
 * Record a refusal. Returns the pause it produced, in ms.
 *
 * Extends an existing pause but never shortens one: two readers can each be
 * refused inside the same second, and the second answer — with a smaller
 * remaining window — must not cancel the first.
 */
export function noteRateLimited(reason: string, now: number = Date.now()): number {
  const until = now + (retryHintMs(reason) ?? DEFAULT_BACKOFF_MS)
  if (until > pausedUntil) pausedUntil = until
  return pausedUntil - now
}

/** Whether this text is the relay refusing on quota, as opposed to any other failure. */
export function isRateLimited(text: string): boolean {
  return text.includes('rate-limited')
}

/** Milliseconds left to wait, or 0. */
export function pausedForMs(now: number = Date.now()): number {
  return Math.max(0, pausedUntil - now)
}

/** Test seam. Nothing in the app clears a pause early. */
export function resetRelayBudget(): void {
  pausedUntil = 0
}
