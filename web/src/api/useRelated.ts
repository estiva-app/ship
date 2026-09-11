import { useEffect, useState } from 'react'
import { readRelated, type RelatedFiles } from './foreign'
import { useRefresh } from '@/lib/useRefresh'

/**
 * What a Related section has to say, and the three things it must not confuse.
 *
 * `undefined` is *unread*: the first read is in flight and the section has
 * nothing to say yet. `'failed'` is *unresolved*: the read did not come back,
 * and the page must not let that look like "nothing is placed here". A value
 * with no files is *empty*, and is the only one of the three that means it.
 * peek#189's invariant, carried over — unresolved ≠ empty ≠ not-permitted —
 * and the third leg is the runtime's: a file the reader cannot see is absent
 * from the folder read by design (the count is the disclosure), so it never
 * reaches this hook at all.
 */
export type RelatedState = RelatedFiles | 'failed' | undefined

/**
 * The foreign files placed under one of Ship's objects — RFC 0.5 §10.7.
 *
 * Read on mount and whenever the object changes, then again when the tab is
 * looked at (`useRefresh` with the timer off: visibility and focus only). Not
 * on the poll, deliberately, for the same reason `FolderPage` is not: this is a
 * Folder read, a handful of requests against a relay that meters the whole tab
 * at 300 a minute (SHI-12), and a file gets placed under a project about as
 * often as somebody opens Peek to do it. Focus is the moment that matters —
 * start a topic under a project in Peek, switch back to Ship, and it is there.
 *
 * A refresh never blanks what is already on screen: a section that flashed to
 * nothing on every focus would be worse than one that is a moment stale.
 *
 * `folder` or `address` absent means there is nothing to read — an object the
 * fold does not have — and the answer is the empty one, not a pending one.
 */
export function useRelated(folder: string | undefined, address: string | undefined): RelatedState {
  const [related, setRelated] = useState<RelatedState>(undefined)
  const [nonce, setNonce] = useState(0)

  // The object changed: what is held belongs to the previous one, so it goes
  // before the new read lands rather than being shown under the wrong title.
  // Not on `nonce` — a refresh keeps the screen.
  useEffect(() => {
    setRelated(undefined)
  }, [folder, address])

  useEffect(() => {
    if (!folder || !address) {
      setRelated({ files: [], counts: {} })
      return
    }
    let live = true
    readRelated(folder, address)
      .then((next) => live && setRelated(next))
      // A failed *refresh* keeps what was read; only a failed first read says so.
      .catch(() => live && setRelated((held) => (held === undefined ? 'failed' : held)))
    return () => {
      live = false
    }
  }, [folder, address, nonce])

  useRefresh(() => setNonce((n) => n + 1), { interval: false })

  return related
}
