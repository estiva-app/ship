import { useEffect, useRef } from 'react'

/** How often a visible tab re-reads. Matches the old app's POLL_MS. */
export const REFRESH_MS = 5000

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
