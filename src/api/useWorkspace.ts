import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceEvents, WorkspaceState } from '../nostr/store'
import { useRefresh } from '../lib/useRefresh'
import { isRateLimited, isRelayBusy } from '../lib/relayBudget'
import { useLiveWorkspace } from './liveWorkspace'
import { foldWorkspace, loadAllEvents, reloadFolders } from './index'

export interface Workspace {
  /** `null` until the first read completes. */
  state: WorkspaceState | null
  /** The last read's failure, or `null`. A stale `state` is kept alongside it. */
  error: string | null
  /**
   * The first read has not landed yet — distinct from an empty workspace.
   *
   * `state` is `null` for both, and the page rendered nothing for both, which
   * is how a slow or refused first read looked like an app that had simply
   * stopped. A caller must be able to tell "still coming" from "there is
   * nothing here".
   */
  loading: boolean
  /**
   * The relay is refusing on quota, and there is nothing on screen yet.
   *
   * SHI-12's rule — a quota refusal is not a broken relay and must not be
   * reported as one — was written for the steady state, where the last good
   * read stays correct and a banner would describe a working app as failing.
   * **Before the first read there is no last good read**, so the same silence
   * leaves a person looking at an empty page with no projects, no issues and
   * no explanation. That is the one case where saying something is right.
   */
  busy: boolean
  /**
   * Re-read now, starting a new read rather than joining one already running.
   *
   * This is what a write awaits, so it may not be coalesced: a read that began
   * before the write cannot contain it. See `read` below.
   *
   * **Pass the Folders the write went into** and only they are re-read — one
   * request instead of the whole workspace (PER-17). Omit them when the write
   * is outside any Folder, such as a global project record, or when it is not
   * known where it went; that reads everything, as before.
   */
  refresh: (folders?: string[]) => Promise<void>
  /**
   * The socket is delivering, so the poll is standing down (PER-3).
   *
   * `false` also covers the build with no sign-in, which has no socket at all
   * and is polled exclusively — see `useLiveWorkspace`.
   */
  live: boolean
}

/**
 * The workspace, kept fresh.
 *
 * Reads once on mount, then whenever the relay says a Folder changed, and on
 * the refresh hook's schedule as a fallback: every `REFRESH_MS` while the tab
 * is visible **and the socket is not live**, on the tab becoming visible, and
 * on window focus.
 *
 * **Ship subscribes now (PER-3).** This module's own comment used to say "Ship
 * polls; it does not subscribe (REW-6)", and that was the largest of the three
 * structural differences between Ship and Peek. The poll is still here and
 * still matters: it is what makes the socket's one silent failure mode
 * survivable, which is a live subscription the relay never matches — measured,
 * and possible on a relay built from a different branch. See `liveWorkspace`.
 *
 * A read that fails keeps the last good state on screen and records the
 * reason, rather than blanking the app.
 */
export function useWorkspace(): Workspace {
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<Promise<void> | null>(null)
  const latest = useRef(0)
  const mounted = useRef(true)
  /** The last applied read, unfolded — what a Folder-scoped re-read keeps. */
  const events = useRef<WorkspaceEvents | null>(null)
  const scoped = useRef<Promise<void>>(Promise.resolve())

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
  const start = useCallback((load: () => Promise<WorkspaceEvents>, whole: boolean): Promise<void> => {
    const ticket = ++latest.current
    const run = load()
      .then((next) => {
        if (!mounted.current || ticket !== latest.current) return
        events.current = next
        setState(foldWorkspace(next))
        setError(null)
        setBusy(false)
      })
      .catch((reason: unknown) => {
        if (!mounted.current || ticket !== latest.current) return
        const text = reason instanceof Error ? reason.message : String(reason)
        /*
          A quota refusal is not a broken relay and must not be reported as one.

          `relayBudget` has already recorded how long to wait and the poll is
          holding off; the workspace on screen is the last good read and stays
          correct until it resumes. Showing "Could not read from the relay"
          over it would describe a working app as failing, and — because the
          banner outranks every other one — would sit there through a condition
          that clears itself in seconds.

          The stale state is kept either way. This only decides whether a person
          is told about a wait they cannot act on. SHI-12.

          A relay that stayed busy through protocol's quiet retries is the same
          kind of wait (APP-9), and the next poll asks again.
        */
        if (isRateLimited(text) || isRelayBusy(reason)) {
          // Recorded rather than swallowed: with a workspace on screen this
          // stays invisible, and without one it is the only thing that can
          // explain the empty page.
          setBusy(true)
          return
        }
        setError(text)
      })
      .finally(() => {
        // Only if it is still ours: a newer read may already have claimed it.
        if (inFlight.current === run) inFlight.current = null
      })
    // Only a whole read is one the poll may join: a focus that joined a
    // Folder-scoped read would skip the full read it exists to make.
    if (whole) inFlight.current = run
    return run
  }, [])

  const read = useCallback((): Promise<void> => start(loadAllEvents, true), [start])

  /**
   * Re-read only the Folders that changed — PER-17.
   *
   * Deleting issues with a few Ship tabs open re-read the whole workspace,
   * 3,483 events, 32 times in one minute: once for the write and once per tab
   * for the socket's echo of it, each a full `loadAll`. The socket already says
   * *which* Folder changed and a write knows where it went, so this replaces
   * that Folder's part of the last read and keeps the rest — one request.
   *
   * Queued one behind another so each starts from the read before it; two
   * running side by side would each drop the other's Folder. Before the first
   * read has landed there is nothing to keep, so it reads everything.
   */
  const reread = useCallback(
    (folders?: string[]): Promise<void> => {
      if (!folders) return read()
      const next = scoped.current.then(() => {
        const previous = events.current
        return previous ? start(() => reloadFolders(previous, folders), false) : read()
      })
      scoped.current = next
      return next
    },
    [read, start],
  )

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

  /*
    The socket triggers `reread` with the Folders it saw change, not `poll`.

    `poll` joins a read already in flight, and a read that began before the
    pushed event cannot contain it — the same reasoning that keeps writes off
    `poll` (Ship #63). Joining one here would drop the change until the next
    tick, which is precisely the latency this ticket exists to remove.

    The debounce lives in `useLiveWorkspace`, so a burst is one read.

    `state?.folders` is empty until the first read lands, so no subscription
    opens before there is a Folder set to subscribe to. Discovery derives that
    set while reading; there is no index to consult.
  */
  const { live } = useLiveWorkspace(state?.folders ?? [], reread)

  // The interval stands down while the socket delivers; `visibilitychange` and
  // `focus` still fire, because a tab that was hidden has had no frames either.
  // Until a read lands the socket watches no Folder, so a live socket delivers
  // nothing: a first read the relay was too busy for is asked again by the poll,
  // or the busy banner's "clears on its own" never comes true (APP-9).
  useRefresh(poll, { interval: !live || state === null })

  return {
    state,
    error,
    loading: state === null && !busy,
    busy: busy && state === null,
    refresh: reread,
    live,
  }
}
