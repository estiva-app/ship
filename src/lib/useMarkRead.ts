import { useEffect } from 'react'
import { markRead, READ_DWELL_MS } from '@/api'

/**
 * Mark what is on screen read, once it has been on screen for a moment (CRO-8).
 *
 * The dwell is the whole reason this is a hook rather than a call: without it,
 * arrowing through an issue list would burn every issue's unread state on the
 * way past. The timer restarts whenever the contexts change, so only what
 * somebody actually settled on is marked.
 *
 * `contexts` is already-built context ids — `undefined` entries are ignored, so
 * a caller can hand in an object that has no protocol identity yet without
 * branching. Building them stays in `readState.ts`, so no page can accidentally
 * pass an issue where a container belongs and mark a whole project read.
 */
export function useMarkRead(contexts: (string | undefined)[]): void {
  // Joined so the effect re-runs when the *set* changes rather than on every
  // render — a new array literal each render would restart the dwell forever
  // and nothing would ever be marked read.
  const key = contexts.filter(Boolean).sort().join('|')
  useEffect(() => {
    if (key.length === 0) return
    const t = setTimeout(() => markRead(key.split('|')), READ_DWELL_MS)
    return () => clearTimeout(t)
  }, [key])
}
