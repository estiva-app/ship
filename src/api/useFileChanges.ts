import { useEffect, useState } from 'react'
import type { SignedEvent } from '@estiva-app/protocol'
import { KIND } from '../nostr/kinds'
import { signedIn } from '../auth/estivaId'
import { relay } from './store'

/** The relay filter for every change ever made to one file: its History. */
export function everyChangeFilter(file: string): Record<string, unknown> {
  return { kinds: [KIND.CHANGE], '#a': [file] }
}

/**
 * Every change to `file`, read only while `open` (its History section is
 * open), and again each time it opens: opening the file itself reads no older
 * change (ALO-19), so a History nobody looks at costs nothing. `undefined`
 * while closed and until the read has come back; a failed read stays
 * `undefined` and is tried again on the next open.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/opening-a-file-reads-its-current-text-not-its-history.md
 */
export function useFileChanges(file: string | undefined, open: boolean): readonly SignedEvent[] | undefined {
  const [read, setRead] = useState<{ file: string; events: readonly SignedEvent[] }>()
  useEffect(() => {
    if (!open || file === undefined || !signedIn()) return
    let live = true
    relay
      .queryAll([everyChangeFilter(file)])
      .then((events) => {
        if (live) setRead({ file, events })
      })
      .catch((error: unknown) => console.warn('[history] could not read the changes of', file, error))
    return () => {
      live = false
      // Closed, or another file: the next open reads afresh.
      setRead(undefined)
    }
  }, [file, open])
  return open && read !== undefined && read.file === file ? read.events : undefined
}
