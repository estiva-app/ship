import { useEffect, useRef, useState } from 'react'
import type { SignedEvent } from '@estiva-app/protocol'
import type { WorkspaceState } from '../nostr/store'
import { store } from './store'

const NONE: readonly SignedEvent[] = []

/**
 * The fewest milliseconds between two reads for one file. The workspace
 * refreshes on every live change, and this read is three to five relay
 * requests from the same per-person budget as everything else in Ship and Peek.
 */
export const MENTIONS_ELSEWHERE_GAP_MS = 15_000

/**
 * The messages that may list under a file's Mentioned in from anywhere on the
 * relay, with their threads — PEEKM-7. The workspace holds only the Folders
 * Ship loads; a Peek topic message or a Leaf comment that links the file is
 * read here (`Store.mentionThreads`), and Activity folds it beside the
 * workspace, for itself only: the sidebar, the live socket's Folders and every
 * other page keep the workspace as read.
 *
 * Read when the file opens, then again when the workspace is — one read at a
 * time and at most every {@link MENTIONS_ELSEWHERE_GAP_MS}, so a burst of
 * refreshes costs one more read, not one each. A refused or failed read keeps
 * what was held: the rows from Ship's own Folders never depended on it, and
 * the ones it brought stay until a read says otherwise.
 */
export function useMentionsElsewhere(addr: string | undefined, state: WorkspaceState): readonly SignedEvent[] {
  const [held, setHeld] = useState<{ addr: string; events: readonly SignedEvent[] }>()
  const run = useRef<{ addr?: string; folders: readonly string[]; busy: boolean; again: boolean; last: number; timer?: ReturnType<typeof setTimeout> }>({
    folders: [],
    busy: false,
    again: false,
    last: 0,
  })
  useEffect(() => {
    if (!addr) return
    const r = run.current
    r.folders = state.folders
    if (r.addr !== addr) {
      clearTimeout(r.timer)
      Object.assign(r, { addr, again: false, last: 0, timer: undefined })
    }
    const schedule = () => {
      if (r.busy) r.again = true
      else if (r.timer === undefined) r.timer = setTimeout(read, Math.max(0, r.last + MENTIONS_ELSEWHERE_GAP_MS - Date.now()))
    }
    // The file open now, not the one this effect ran for: a read still out for the last file hands its turn on.
    const read = () => {
      r.timer = undefined
      const target = r.addr
      if (!target) return
      r.busy = true
      r.last = Date.now()
      store
        .mentionThreads(target, r.folders)
        .then((events) => {
          if (r.addr === target) setHeld({ addr: target, events })
        })
        .catch(() => {})
        .finally(() => {
          r.busy = false
          if (r.again) {
            r.again = false
            schedule()
          }
        })
    }
    schedule()
  }, [addr, state])
  useEffect(() => {
    const r = run.current
    return () => {
      clearTimeout(r.timer)
      r.addr = undefined
    }
  }, [])
  return held && held.addr === addr ? held.events : NONE
}
