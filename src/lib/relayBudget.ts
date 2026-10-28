/**
 * How long the relay has asked this tab to wait (SHI-12).
 *
 * Buzz meters `POST /query` against `human_api_calls_per_min` — a fixed
 * 60-second window, default **300**, applied to every bridge call whatever tier
 * the caller is (`enforce_http_admission`, `api/bridge.rs`). Ship's readers are
 * well inside that at rest — 26 requests a minute with an issue page open.
 *
 * This module is the part that holds when headroom runs out anyway, because
 * **the budget is shared** across every tab and tool signed in as the same key,
 * so Ship can be well inside its own share and still be refused. The relay says
 * exactly how long to wait — `rate-limited: quota exceeded; retry in 10s` — and
 * it is the only participant that knows.
 *
 * ## Why the transport reports and the cadence honours
 *
 * Three readers poll on `useRefresh` — the workspace, the read-state frontier
 * and the foreign-reference widgets — and each swallows its own errors,
 * reasonably: none of them wants a failed poll to blank the screen. That means
 * no single reader can see that the *tab* is over budget, and a fix in any one
 * of them leaves the other two spending.
 *
 * One budget, written by the transport (which sees every 429) and read by the
 * shared cadence (which is what every poller already goes through), covers all
 * three without any of them knowing about quotas.
 *
 * **A person's own action is deliberately not paused.** `act` re-reads through
 * `Workspace.refresh` directly rather than through `useRefresh`, so a write
 * still shows its result at once. Backing off a poll costs freshness nobody
 * asked for; backing off a click costs the thing they just did.
 *
 * ## The mechanism is shared now (PER-13)
 *
 * Peek had neither half, and two Peek tabs beside this one pushed Miky's key to
 * 306 in a minute on 2026-09-23. So the budget moved into
 * `@estiva-app/platform` as `createRelayBudget`, and both apps build one. This
 * file keeps the binding — the package holds none — and the names every caller
 * here already imports.
 */
import { createRelayBudget } from '@estiva-app/platform'
import { RELAY_BUSY_MESSAGE, RelayBusyError } from '@estiva-app/protocol'

export { DEFAULT_BACKOFF_MS, isRateLimited, retryHintMs } from '@estiva-app/platform'

/**
 * The relay stayed busy through protocol's quiet retries (APP-9): a read's
 * `RelayBusyError`, or a write refused with protocol's busy words. Like a
 * quota refusal it is a wait, not a broken relay or a judgement on the write,
 * so it goes down the same paths (SHI-12).
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-busy-relay-says-it-is-busy.md
 */
export function isRelayBusy(reason: unknown): boolean {
  if (reason instanceof RelayBusyError) return true
  const text = reason instanceof Error ? reason.message : String(reason)
  return text.includes(RELAY_BUSY_MESSAGE)
}

/** This tab's budget. */
export const relayBudget = createRelayBudget()

/**
 * Record a refusal. Returns the pause it produced, in ms. Extends an existing
 * pause but never shortens one.
 */
export function noteRateLimited(reason: string): number {
  return relayBudget.noteRateLimited(reason)
}

/** Milliseconds left to wait, or 0. */
export function pausedForMs(): number {
  return relayBudget.pausedForMs()
}

/** Test seam. Nothing in the app clears a pause early. */
export function resetRelayBudget(): void {
  relayBudget.reset()
}
