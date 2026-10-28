import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceEvents, WorkspaceState } from '../nostr/store'
import { useRefresh } from '../lib/useRefresh'
import { isRateLimited, isRelayBusy, pausedForMs, relayBudget } from '../lib/relayBudget'
import { useLiveWorkspace } from './liveWorkspace'
import { foldWorkspace, holdsThreads, loadAllEvents, loadOpened, readThreads, reloadFolders, type ThreadsWanted } from './index'

/** What the relay's "retry in Ns" can fall short of its window by: it rounds down to whole seconds. */
const ROUNDED_DOWN_MS = 1_000

/** The project or issue the tab was opened on, read first so its page draws before the workspace — APP-4. */
export interface Opened {
  kind: 'project' | 'issue'
  d: string
}

export interface Workspace {
  /** `null` until the first read completes, or the opened page's own read — see `partial`. */
  state: WorkspaceState | null
  /**
   * `state` is only the opened project or issue and its own Folder, while the
   * whole read runs (APP-4). Its page draws from it; everything else — the
   * sidebar's counts, the other lists — waits as it does with no state, and
   * nothing that judges the whole workspace (a ref claim) reads it.
   */
  partial: boolean
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
   * The conversations the screen draws (APP-5): read now if they are not
   * held, and with every whole read from then on. The last call wins — one
   * screen at a time. See `useThreads`.
   */
  wantThreads: (wanted: ThreadsWanted) => void
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
 *
 * Opened on a project or issue, that page's own read runs beside the first
 * whole one and is shown until the whole one lands (APP-4; Miky, 28 Oct): on
 * 28 Oct the whole read took 5–6 s and the opened page's own 0.4–0.7 s. Only
 * the tab's first route counts; a later page waits for the whole read.
 *
 * Conversations are read only for the screen that draws them (APP-5): the
 * whole read asks each Folder the screen wants for its messages, comments and
 * edits as it reads it, and the rest for none; whatever it missed — a Folder
 * named after the read began, the Folders mentioning the screen's file — is
 * read before it lands, so a screen never loses its conversations to a poll.
 */
export function useWorkspace(opened?: Opened): Workspace {
  const first = useRef(opened)
  const [state, setState] = useState<WorkspaceState | null>(null)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<Promise<void> | null>(null)
  const latest = useRef(0)
  const mounted = useRef(true)
  /** The last applied read, unfolded — what a Folder-scoped re-read keeps. */
  const events = useRef<WorkspaceEvents | null>(null)
  const scoped = useRef<Promise<void>>(Promise.resolve())
  const wanted = useRef<ThreadsWanted>({ folders: [], about: [] })
  /** The wanted conversations being read now, so a screen drawing again does not ask twice. */
  const asking = useRef<ThreadsWanted | null>(null)

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
        setPartial(false)
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

  const read = useCallback(
    (): Promise<void> =>
      start(async () => {
        // Asked of each Folder as it is read, so a screen that asked while the read ran still gets its own.
        const whole = await loadAllEvents((folder) => wanted.current.folders.includes(folder))
        return holdsThreads(whole, wanted.current) ? whole : readThreads(whole, wanted.current)
      }, true),
    [start],
  )

  const wantThreads = useCallback(
    (next: ThreadsWanted): void => {
      wanted.current = next
      // Before the first whole read there is nothing to add to, and while one runs it brings them: a read
      // started here would throw that one away, and with it a Folder this reader has lost since.
      if (!events.current || inFlight.current || holdsThreads(events.current, next) || asking.current === next) return
      asking.current = next
      // Queued behind the Folder re-reads, as they are behind each other, so neither drops the other's events.
      const run = scoped.current.then(() => {
        const held = events.current
        return held && !holdsThreads(held, next) ? start(() => readThreads(held, next), false) : undefined
      })
      scoped.current = run
      void run.finally(() => {
        if (asking.current === next) asking.current = null
      })
    },
    [start],
  )

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
      const next = scoped.current.then(async () => {
        // A write on the opened page before the whole read lands (APP-4): let
        // that read land rather than start a second, then re-read this Folder on it.
        if (!events.current && inFlight.current) await inFlight.current
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
    /* Nothing on screen yet and the relay refused on quota: ask again the
       moment its stated wait ends. The poll skips its ticks while paused and
       reads on the first one after, up to a whole interval late — 25 s to a
       project on 28 Oct, the relay having said 11 (APP-4). A busy relay
       records no pause, so it keeps the poll's pace (APP-9). The relay
       rounds its wait down, so asking at once was refused again a moment
       before its window reset: a second is added. A hidden tab does not ask:
       nobody is looking, and the poll reads when it is shown. */
    const whenClear = async (): Promise<boolean> => {
      if (pausedForMs() === 0) return false
      await relayBudget.whenClear()
      await new Promise((resolve) => setTimeout(resolve, ROUNDED_DOWN_MS))
      return mounted.current && !events.current && document.visibilityState === 'visible'
    }
    const firstRead = async (): Promise<void> => {
      // A focus may have read the whole workspace while the opened page was being read.
      if (events.current) return
      await poll()
      if (!events.current && (await whenClear())) await firstRead()
    }
    /* Shown only while no whole read has landed, and never kept as one: a
       re-read keeps `events`, and this holds one Folder. Any other failure
       leaves the page to the whole read, as before. */
    const opened = first.current
    const openedRead = (asked: Promise<WorkspaceEvents>): Promise<void> =>
      asked.then(
        (own) => {
          if (!mounted.current || events.current) return
          setState(foldWorkspace(own))
          setPartial(true)
        },
        async (reason: unknown) => {
          if (!isRateLimited(reason instanceof Error ? reason.message : String(reason))) return
          if (opened && !events.current && (await whenClear())) await openedRead(loadOpened(opened))
        },
      )
    /* The opened page's read goes alone, and the whole read starts when it
       has answered (APP-4). Side by side, its 0.3 MB shared the connection
       with the whole read's 10 MB pages of changes and finished with them,
       then waited out their parse: drawn at 1.7–2.7 s on 28 Oct, though its
       own answers took 0.4 s. A refusal or a failure answers too: the whole
       read then goes as before. */
    if (opened) {
      const asked = loadOpened(opened)
      void openedRead(asked)
      void asked.then(firstRead, firstRead)
    } else void firstRead()
    return () => {
      mounted.current = false
    }
  }, [poll])

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
  // Not on the opened page's own read: a change there before the whole read
  // lands would re-read the whole workspace again, and that read brings it.
  const { live } = useLiveWorkspace(partial ? [] : (state?.folders ?? []), reread)

  // The interval stands down while the socket delivers; `visibilitychange` and
  // `focus` still fire, because a tab that was hidden has had no frames either.
  // A socket that watches no Folder delivers nothing, live or not — before the
  // first read lands, or when it found none. The poll then keeps asking, or a
  // first read the relay was too busy for is never asked again and the busy
  // banner's "clears on its own" never comes true (APP-9). The same rate as a
  // tab with no socket.
  useRefresh(poll, { interval: !live || !state?.folders.length })

  return {
    state,
    partial,
    error,
    loading: state === null && !busy,
    busy: busy && state === null,
    refresh: reread,
    wantThreads,
    live,
  }
}
