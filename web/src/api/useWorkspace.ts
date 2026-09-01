import { useCallback, useEffect, useRef, useState } from 'react'
import type { FolderState } from '../../../src/fold'
import { useRefresh } from '../lib/useRefresh'
import { loadAll } from './index'

export interface Workspace {
  /** `null` until the first read completes. */
  state: FolderState | null
  /** The last read's failure, or `null`. A stale `state` is kept alongside it. */
  error: string | null
  /**
   * Re-read now, starting a new read rather than joining one already running.
   *
   * This is what a write awaits, so it may not be coalesced: a read that began
   * before the write cannot contain it. See `read` below.
   */
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
  const latest = useRef(0)
  const mounted = useRef(true)

  /**
   * One read, always a new one.
   *
   * Two reads may therefore overlap, and the older can land second — a full
   * `loadAll` takes seconds against production, so this is ordinary rather
   * than pathological. `latest` is what keeps that safe: a result is applied
   * only if no newer read has started since, so state never goes backwards.
   * Without it the fix for a stale re-read would introduce a worse bug, where
   * a slow poll overwrites the state a write just produced.
   */
  const read = useCallback((): Promise<void> => {
    const ticket = ++latest.current
    const run = loadAll()
      .then((next) => {
        if (!mounted.current || ticket !== latest.current) return
        setState(next)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!mounted.current || ticket !== latest.current) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        // Only if it is still ours: a newer read may already have claimed it.
        if (inFlight.current === run) inFlight.current = null
      })
    inFlight.current = run
    return run
  }, [])

  /**
   * The poll's read, which *is* coalesced — two identical reads a second apart
   * are waste, and switching to a tab raises both `visibilitychange` and
   * `focus`.
   *
   * A write must not come through here. `act` awaits this promise and then
   * shows what it resolves with, so joining a read that started before the
   * write puts the pre-write value back on screen: the status snaps to what it
   * was, the write having succeeded (Ship #63).
   */
  const poll = useCallback((): Promise<void> => inFlight.current ?? read(), [read])

  useEffect(() => {
    mounted.current = true
    void read()
    return () => {
      mounted.current = false
    }
  }, [read])

  useRefresh(poll)

  return { state, error, refresh: read }
}
