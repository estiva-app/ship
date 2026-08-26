import { useCallback, useEffect, useRef, useState } from 'react'
import type { FolderState } from '../../../src/fold'
import { useRefresh } from '../lib/useRefresh'
import { loadAll } from './index'

export interface Workspace {
  /** `null` until the first read completes. */
  state: FolderState | null
  /** The last read's failure, or `null`. A stale `state` is kept alongside it. */
  error: string | null
  /** Re-read now. Safe to call while a read is in flight — it is coalesced. */
  refresh: () => Promise<void>
}

/**
 * The workspace, kept fresh.
 *
 * Reads once on mount and then on the refresh hook's schedule: every ~5 s
 * while the tab is visible, on the tab becoming visible, on window focus.
 * Ship polls; it does not subscribe (REW-6). A read that fails keeps the last
 * good state on screen and records the reason, rather than blanking the app.
 */
export function useWorkspace(): Workspace {
  const [state, setState] = useState<FolderState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const run = loadAll()
      .then((next) => {
        if (!mounted.current) return
        setState(next)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        inFlight.current = null
      })
    inFlight.current = run
    return run
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => {
      mounted.current = false
    }
  }, [refresh])

  useRefresh(refresh)

  return { state, error, refresh }
}
