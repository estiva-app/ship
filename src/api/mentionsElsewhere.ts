import { useEffect, useRef, useState } from 'react'
import type { SignedEvent } from '@estiva-app/protocol'
import type { WorkspaceState } from '../nostr/store'
import { store } from './store'

const NONE: readonly SignedEvent[] = []

/**
 * The messages that may list under a file's Mentioned in from anywhere on the
 * relay, with their threads — PEEKM-7. The workspace holds only the Folders
 * Ship loads; a Peek topic message or a Leaf comment that links the file is
 * read here (`Store.mentionThreads`), and Activity folds it beside the
 * workspace, for itself only: the sidebar, the live socket's Folders and every
 * other page keep the workspace as read.
 *
 * Read again whenever the workspace is, so a refresh brings a new mention. A
 * refused or failed read keeps what was held: the rows from Ship's own Folders
 * never depended on it, and the ones it brought stay until a read says otherwise.
 */
export function useMentionsElsewhere(addr: string | undefined, state: WorkspaceState): readonly SignedEvent[] {
  const [held, setHeld] = useState<{ addr: string; events: readonly SignedEvent[]; at: number }>()
  const asked = useRef(0)
  useEffect(() => {
    if (!addr) return
    // A read that lands after a newer one began for the same file still holds good rows; an older one never replaces a newer one.
    const ticket = ++asked.current
    store
      .mentionThreads(addr, state.folders)
      .then((events) => setHeld((before) => (before && before.addr === addr && before.at > ticket ? before : { addr, events, at: ticket })))
      .catch(() => {})
  }, [addr, state])
  return held && held.addr === addr ? held.events : NONE
}
