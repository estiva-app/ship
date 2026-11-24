import { useEffect } from 'react'

/*
  KIN-6 — ⌘K's Add issue and New project open Ship's own forms, which live on Ship's pages (Decided on KIN-6's Done
  when). A page that holds the form says so here while it is drawn; asked from anywhere else, the box goes to the page
  that holds it, which opens it as it arrives.
*/

export type ShipForm = 'issue' | 'project'

const here = new Map<ShipForm, () => void>()
let asked: ShipForm | null = null
let askedAt = 0
/** How long an ask waits for its page: a page that never arrived (a sign-in on the way) does not open the form later, unasked. */
const ASK_WAITS_MS = 15_000

/** A page that can open this form now: while it is drawn, ⌘K's action opens it here. */
export function useFormHere(form: ShipForm, open: (() => void) | undefined): void {
  useEffect(() => {
    if (!open) return
    here.set(form, open)
    // Asked from another page: this is where the box sent the person, and the form opens as the page arrives.
    if (asked === form) {
      asked = null
      if (Date.now() - askedAt < ASK_WAITS_MS) open()
    }
    return () => {
      if (here.get(form) === open) here.delete(form)
    }
  }, [form, open])
}

/** Open the form on this page when it has one; otherwise go where it is (`elsewhere`), and it opens there. */
export function askForm(form: ShipForm, elsewhere: () => void): void {
  const open = here.get(form)
  if (open) return open()
  asked = form
  askedAt = Date.now()
  elsewhere()
}

/** Whether the page drawn now holds this form. */
export function formHere(form: ShipForm): boolean {
  return here.has(form)
}
