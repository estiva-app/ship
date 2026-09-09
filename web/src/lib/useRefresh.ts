import { useEffect, useRef } from 'react'
import { pausedForMs } from './relayBudget'

/**
 * How often a visible tab re-reads.
 *
 * 5000 → 10000 (SHI-12) → **20000 (2026-09-07)**, each time because the
 * arithmetic against the relay's meter said so.
 *
 * ## What a tick actually costs
 *
 * Buzz meters `POST /query` at **300 a minute, per pubkey** — not per app, so
 * a Ship tab and a Peek tab signed in as the same person share one allowance
 * (`enforce_http_admission` runs once per HTTP call, before the filters are
 * even parsed, so the unit is *requests* and not filters).
 *
 * Measured against production on 2026-09-07 by counting the transport's calls
 * through one real `loadAll`: **38 requests, 1335 ms**. Three other readers
 * share this same tick — foreign objects, foreign references, and reactions —
 * but each is a single batched request, so the workspace read is the number
 * that matters.
 *
 * | interval | reads/min | requests/min | of 300 |
 * | --- | --- | --- | --- |
 * | 5 s | 12 | 36 | 12% |
 * | 10 s | 6 | **18** | **6%** |
 * | 20 s | 3 | 9 | 3% |
 *
 * ## The stopgap is over
 *
 * Twenty seconds was never meant to be kept. It bought room while the workspace
 * read cost one request per Folder, and the note here said so: *the batching
 * work is what earns this number back.* That work landed — protocol 0.15.0
 * sends every filter's first page in one request — and the read went from **39
 * requests to 3** against production, 1001 ms to 577 ms, folding to a
 * byte-identical state.
 *
 * So the table above is the old one recomputed, and ten seconds now costs less
 * than twenty used to by a factor of twelve.
 *
 * The other two pollers are one request each per tick and stay that way: the
 * read-state frontier is a single filter every 30 s (2/min), and reactions are
 * a single filter on this interval (6/min at ten seconds). With an issue page
 * open the whole tab is **26 requests a minute — under 9%** of the allowance,
 * against 122 before.
 *
 * ## Why not five
 *
 * It would fit — 12% with everything open. But the poll is about to stop being
 * the delivery mechanism: PER-3 adopts the live socket Peek already runs on,
 * after which this interval governs a fallback rather than how quickly anything
 * appears. Spending headroom to make a mechanism marginally fresher, weeks
 * before it is demoted, is the wrong trade.
 *
 * **Freshness of one's own actions does not depend on this number.** A write
 * re-reads immediately through `Workspace.refresh`; this governs only how
 * quickly somebody *else's* change turns up.
 *
 * The ceiling is no longer a function of how many Folders there are, which is
 * what made the old number expire on its own. It still is not permanent — the
 * budget is shared with every other tab and tool signed in as the same key —
 * so see `relayBudget` for the part that holds when it runs out anyway.
 */
export const REFRESH_MS = 10_000

/**
 * Two events often fire for one gesture — switching to a tab raises both
 * `visibilitychange` and `focus` — and one read is enough for it.
 */
const COALESCE_MS = 1000

export interface RefreshOptions {
  intervalMs?: number
  /**
   * Whether the timer runs at all. Default `true`.
   *
   * PER-3 turns this off while the live socket is connected, which is what
   * demotes the poll from the delivery mechanism to a fallback — the same shape
   * Peek has had since PEE-8: `useRefreshTriggers(…, { interval: relayState !==
   * 'live' })`.
   *
   * **Only the timer.** `visibilitychange` and `focus` still fire, on purpose: a
   * tab that was hidden for ten minutes has had no socket frames delivered to
   * it either — a backgrounded tab's socket may have been dropped by the
   * browser, and a reconnect's backfill is not instant — so re-reading when
   * somebody looks at it is right whether or not the socket says `live`.
   */
  interval?: boolean
}

/**
 * Keep something fresh the way the old app does (REW-6, a release blocker).
 *
 * - every `intervalMs` while the document is visible — never in a hidden
 *   tab, where nothing on screen can be stale and a timer is only waste
 * - immediately when the document becomes visible, so a tab that was hidden
 *   for ten minutes does not show ten-minute-old state the moment it is
 *   looked at
 * - immediately on window focus
 *
 * Extracted once so a new view cannot forget it. Does not fire on mount —
 * the caller owns its first read. Cleans up its timer and listeners on
 * unmount, and never stacks one interval per render.
 */
export function useRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = REFRESH_MS, interval = true }: RefreshOptions = {},
): void {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  }, [refresh])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let lastAt = 0

    const tick = () => {
      const now = Date.now()
      if (now - lastAt < COALESCE_MS) return
      // The relay has refused on quota and said how long to wait. Skipping is
      // the whole backoff: `lastAt` is left alone, so the first tick after the
      // pause expires runs immediately rather than waiting out another
      // interval. See `relayBudget` for why this is the right place.
      if (pausedForMs(now) > 0) return
      lastAt = now
      void latest.current()
    }
    const start = () => {
      if (!interval) return
      if (timer === undefined) timer = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick()
        start()
      } else {
        stop()
      }
    }
    const onFocus = () => tick()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    if (document.visibilityState === 'visible') start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs, interval])
}
