import { useCallback, useEffect, useState } from 'react'
import { resolveForeign, type ForeignObject } from '@/api/foreign'
import { useRefresh } from '@/lib/useRefresh'

/** A resolve that threw — not an answer, unlike `null`. */
const FAILED: unique symbol = Symbol('failed')

/**
 * Resolve a body's `nostr:` references, once for the whole body.
 *
 * Extracted from `ForeignReferences` by RIC-10, which needed the same answers
 * in two places: the objects drawn *below* the text, and the ones drawn **in
 * place** inside a sentence. Resolving twice would mean two fetches per
 * reference and — worse — two chances for the same object to be shown in two
 * states on one screen.
 *
 * ## The refresh cadence is the load-bearing part
 *
 * A referenced object belongs to another app and this one controls none of its
 * lifecycle: somebody replies in Peek and a Ship reader is looking at something
 * that has moved on. Resolving once on mount made the widget a screenshot with
 * no timestamp, which is worse than a stale list — a list that is obviously a
 * list invites a refresh, a live-looking card does not. PRO-10's central claim
 * is liveness and it was not true.
 *
 * `useRefresh` rather than a socket, deliberately: it is what every other view
 * already uses (`REFRESH_MS` while visible, immediately on focus, never in a
 * hidden tab), so a reference is exactly as fresh as the page around it. A
 * refresh never blanks what is on screen — see the effects below.
 *
 * @returns `undefined` while the first resolve is in flight, then one entry per
 *   reference — `null` where nothing resolved, which is a real answer and not
 *   an error.
 */
export function useForeignObjects(references: readonly string[]): (ForeignObject | null)[] | undefined {
  const [objects, setObjects] = useState<(ForeignObject | null)[] | undefined>(undefined)
  const [nonce, setNonce] = useState(0)

  // The joined string rather than the array: a new array every render would
  // re-resolve on every keystroke in the editor above.
  const key = references.join(',')

  const resolve = useCallback(() => {
    if (references.length === 0) {
      setObjects([])
      return undefined
    }
    let cancelled = false
    Promise.all(references.map((r) => resolveForeign(r).catch((): typeof FAILED => FAILED))).then((found) => {
      // The body can change while this is in flight, and a late answer about a
      // reference that is no longer there would be worse than none.
      if (cancelled) return
      // A throw is not an answer. On the first resolve it draws as `null`, as
      // it always has; on a refresh it keeps the card that is already there,
      // so one dropped request does not take a correct card off the page.
      setObjects((held) => found.map((f, i) => (f === FAILED ? (held?.[i] ?? null) : f)))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  /*
    Only a new set of references blanks the list (PER-6).

    This used to run `setObjects(undefined)` on `nonce` as well, so every tick
    put every card back to its skeleton and every in-place mention back to its
    pending state until the re-resolve landed — on the project page that is
    each message carrying an issue pointer, which is most of them, and it is
    what "reloads the conversations" was. What is held belongs to the same
    references until `key` changes, so a refresh replaces it in one step.
  */
  useEffect(() => {
    setObjects(undefined)
  }, [key])

  useEffect(
    () => resolve(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, nonce],
  )

  useRefresh(() => setNonce((n) => n + 1))

  return objects
}

/** The same answers keyed by reference, for a caller drawing them in place. */
export function byReference(
  references: readonly string[],
  objects: (ForeignObject | null)[] | undefined,
): Record<string, ForeignObject | null | undefined> {
  const out: Record<string, ForeignObject | null | undefined> = {}
  references.forEach((r, i) => {
    out[r] = objects?.[i]
  })
  return out
}
