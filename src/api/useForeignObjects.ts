import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveForeign, type ForeignObject } from '@/api/foreign'
import { useRefresh } from '@/lib/useRefresh'

/** A resolve that threw — not an answer, unlike `null`. */
const FAILED: unique symbol = Symbol('failed')

/** References whose last resolve threw with no answer before it, so they draw as `null` without being one. */
const failedNow = new Set<string>()

/**
 * Whether a `null` for this reference is a failed read (a 429, the network)
 * rather than an answer of nothing: a card remembers "not available" only for
 * the second (Peek's OPT-10 rule).
 */
export function resolveFailed(reference: string): boolean {
  return failedNow.has(reference)
}

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
 *   an error, and `undefined` for a reference added since, until it resolves.
 */
export function useForeignObjects(references: readonly string[]): (ForeignObject | null | undefined)[] | undefined {
  const [objects, setObjects] = useState<(ForeignObject | null | undefined)[] | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  // The last answer for each reference drawn, by reference, so a new set keeps what it shares with the old one.
  const answers = useRef(new Map<string, ForeignObject | null>())

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
      found.forEach((f, i) => {
        if (f !== FAILED) failedNow.delete(references[i])
        else if (!answers.current.has(references[i])) failedNow.add(references[i])
      })
      const next = found.map((f, i) => (f === FAILED ? (answers.current.get(references[i]) ?? null) : f))
      next.forEach((object, i) => answers.current.set(references[i], object))
      setObjects(next)
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

    A new set keeps the answers it shares with the old one, and only what is new
    waits (OPT-18): a conversation's set grows each time a link's answer comes
    back, and blanking it then put every chip and card on the page back to
    pending for one new reference.
  */
  useEffect(() => {
    const kept = new Map(references.flatMap((r) => (answers.current.has(r) ? [[r, answers.current.get(r) ?? null] as const] : [])))
    answers.current = kept
    setObjects(kept.size > 0 ? references.map((r) => kept.get(r)) : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  objects: (ForeignObject | null | undefined)[] | undefined,
): Record<string, ForeignObject | null | undefined> {
  const out: Record<string, ForeignObject | null | undefined> = {}
  references.forEach((r, i) => {
    out[r] = objects?.[i]
  })
  return out
}
