import { useCallback, useEffect, useState } from 'react'
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
 * open), again each time it opens, and again when `again` changes (the page
 * joined, left or added somebody): opening the file itself reads no older
 * change (ALO-19), so a History nobody looks at costs nothing. `undefined`
 * while closed and until the read has come back; `null` when it failed, so
 * the section stops waiting and shows what the load holds.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/opening-a-file-reads-its-current-text-not-its-history.md
 */
export function useFileChanges(file: string | undefined, open: boolean, again = 0): readonly SignedEvent[] | null | undefined {
  const [read, setRead] = useState<{ file: string; events: readonly SignedEvent[] | null }>()
  useEffect(() => {
    if (!open || file === undefined || !signedIn()) return
    let live = true
    relay
      .queryAll([everyChangeFilter(file)])
      .then((events) => {
        if (live) setRead({ file, events })
      })
      .catch((error: unknown) => {
        console.warn('[history] could not read the changes of', file, error)
        if (live) setRead({ file, events: null })
      })
    return () => {
      live = false
    }
  }, [file, open, again])
  // Closed, the held read is not shown; the next open reads afresh and shows the old rows only until it lands.
  return open && read !== undefined && read.file === file ? read.events : undefined
}

/**
 * A file page's History section: folded on every visit and read only while
 * open (Miky, 2026-11-10). Held as the file it was opened on, so moving to
 * another file finds it folded and reads nothing. `again()` re-reads an open
 * History after the page joined, left or added somebody.
 */
export function useHistoryFold(file: string | undefined): {
  open: boolean
  setOpen: (open: boolean) => void
  again: () => void
  changes: readonly SignedEvent[] | null | undefined
} {
  const [openOn, setOpenOn] = useState<string>()
  const [count, setCount] = useState(0)
  const open = file !== undefined && openOn === file
  const changes = useFileChanges(file, open, count)
  const setOpen = useCallback((next: boolean) => setOpenOn(next ? file : undefined), [file])
  const again = useCallback(() => setCount((n) => n + 1), [])
  return { open, setOpen, again, changes }
}
