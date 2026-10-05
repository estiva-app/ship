import { useCallback, useEffect, useState } from 'react'
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
 * branching. Building them stays in `@estiva-app/conversation`'s context helpers, so no page can accidentally
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

/**
 * The threads whose replies are drawn right now, as `ThreadList`'s
 * `onThreadShown` reports them (CON-34). Under SPEC §11.3's thread rule a
 * reply is read only by drawing it, so a page marks these `thread:` contexts
 * and not every thread it holds: a collapsed thread, or one on a tab that is
 * not showing, has not been seen.
 */
export function useShownThreads(): [readonly string[], (threadId: string, open: boolean) => void] {
  const [shown, setShown] = useState<readonly string[]>([])
  const onShown = useCallback((threadId: string, open: boolean) => {
    setShown((prev) => {
      if (open) return prev.includes(threadId) ? prev : [...prev, threadId]
      return prev.includes(threadId) ? prev.filter((id) => id !== threadId) : prev
    })
  }, [])
  return [shown, onShown]
}
