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
 * | 5 s | 12 | 456 | **152%** |
 * | 10 s | 6 | 228 | **76%** |
 * | 20 s | 3 | 114 | 38% |
 *
 * Ten seconds left 24% for everything else, which reactions alone could spend:
 * before CON-2's budget fix a click cost a whole workspace re-read. The
 * symptom was not a slow app but a **blank** one — `rate-limited: quota
 * exceeded` on a cold start renders no workspace at all (see `useWorkspace`).
 *
 * ## This is a stopgap, and the real fix is next door
 *
 * 38 is not inherent. `rawFolders` sends one filter per Folder and `queryAll`
 * pages each filter in its own request; the relay accepts all 34 filters in
 * **one** POST and clamps per filter — measured the same day: same complete
 * answer, 1 request, 362 ms. Ship did it that way until `queryAll` was adopted
 * for correctness (a Folder past the page ceiling would otherwise be silently
 * short-read — real, and not currently happening: the busiest Folder holds
 * 130 events).
 *
 * So the batching work is what earns this number back. Twenty seconds is what
 * makes the app usable in the meantime, and it is meant to be reverted rather
 * than kept.
 *
 * **Freshness of one's own actions does not depend on this number.** A write
 * re-reads immediately through `Workspace.refresh`; this governs only how
 * quickly somebody *else's* change turns up.
 *
 * Not a number that stays right on its own: the workspace read costs a request
 * per Folder, so the ceiling falls as the workspace grows. See `relayBudget`
 * for the part that holds when it does.
 */
export const REFRESH_MS = 20_000

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
