import { useEffect, useRef } from 'react'
import { pausedForMs } from './relayBudget'

/**
 * How often a visible tab re-reads.
 *
 * Was 5000 — the old app's POLL_MS, carried over — until SHI-12 did the
 * arithmetic against what the relay actually allows. Buzz meters `POST /query`
 * at 300 a minute, and three readers share this one tick: the workspace read
 * (34 requests against production, measured), the read-state frontier (1), and
 * the foreign-reference widgets (4 per reference on the open issue).
 *
 * At five seconds that is 12 ticks a minute and 420 requests before a single
 * reference is on screen — over the ceiling, and `rate-limited: quota exceeded`
 * is what a person then gets instead of their own status change appearing. At
 * ten seconds it is 210, with room for four references.
 *
 * **Freshness of one's own actions does not depend on this number.** A write
 * re-reads immediately through `Workspace.refresh`; this governs only how
 * quickly somebody *else's* change turns up.
 *
 * Not a number that stays right on its own: the workspace read costs one
 * request per Folder, so the ceiling falls as the workspace grows. See
 * `relayBudget` for the part that holds when it does.
 */
export const REFRESH_MS = 10_000

/**
 * Two events often fire for one gesture — switching to a tab raises both
 * `visibilitychange` and `focus` — and one read is enough for it.
 */
const COALESCE_MS = 1000

export interface RefreshOptions {
  intervalMs?: number
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
export function useRefresh(refresh: () => void | Promise<void>, { intervalMs = REFRESH_MS }: RefreshOptions = {}): void {
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
  }, [intervalMs])
}
