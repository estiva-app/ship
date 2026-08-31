import { useEffect, useState } from 'react'
import { findNaddrs } from '@estiva-app/protocol'
import { resolveForeign, type ForeignObject as Data } from '@/api/foreign'
import { ForeignObject } from './ui/ForeignObject'
import { SkeletonBar } from './ui/Skeleton'

/**
 * Every `nostr:naddr…` in a body of text, rendered as the object it names.
 *
 * This is the payoff of PRO-7 and the thing Ship has never been able to do:
 * paste a reference to another app's object into a description and have it
 * *stay live* rather than being a string somebody has to go and look up.
 *
 * ## Why it renders below the text rather than inside it
 *
 * Inline replacement is the nicer end state and it is not this ticket's. A
 * block inside a description needs the description to be a block model, which
 * is §6 anchoring, which is RIC-1 — undecided on purpose. Rendering below is
 * the honest version available today: it adds a live object without pretending
 * the field it came from has a structure it does not have.
 *
 * ## The states, and why there are more than two
 *
 * A foreign object has more failure states than anything else on the screen,
 * because this app controls none of its lifecycle. Loading and "cannot see it"
 * are drawn distinctly; "cannot see it" and "empty" are drawn distinctly by
 * `ForeignObject` itself, because the relay answers both with silence.
 *
 * A reference that resolves to nothing at all — a malformed pointer, or a kind
 * no app claims — draws *nothing here*. That is deliberate: there is no object
 * to report on, and an error beside somebody's prose about a string they may
 * not have meant as a reference is noise.
 */
export function ForeignReferences({ text, className }: { text: string; className?: string }) {
  const references = findNaddrs(text ?? '')
  const [objects, setObjects] = useState<(Data | null)[] | undefined>(undefined)

  // `references.join()` rather than the array: a new array every render would
  // re-resolve on every keystroke in the description above.
  const key = references.join(',')

  useEffect(() => {
    if (references.length === 0) {
      setObjects([])
      return
    }
    let cancelled = false
    setObjects(undefined)
    Promise.all(references.map((r) => resolveForeign(r).catch(() => null))).then((found) => {
      // The description can change while this is in flight, and a late answer
      // about a reference that is no longer there would be worse than none.
      if (!cancelled) setObjects(found)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (references.length === 0) return null

  if (objects === undefined) {
    return (
      <div className={className} data-foreign-references="loading">
        <SkeletonBar className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  const resolved = objects.filter((o): o is Data => o !== null)
  if (resolved.length === 0) return null

  return (
    <div className={className} data-foreign-references={String(resolved.length)}>
      {resolved.map((object) => (
        <ForeignObject key={object.ref} object={object} />
      ))}
    </div>
  )
}
