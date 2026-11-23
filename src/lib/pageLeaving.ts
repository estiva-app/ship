/**
 * Whether the page is on its way out: reloading, going to another address, or closing (SHI-68).
 *
 * A page that leaves has its requests cancelled, and each lands in the app as "the server was not reached". In its
 * last milliseconds the page drew "didn't load" for a read it had cut itself and reported it; nobody saw it, the
 * page was already being replaced. Traced on production, 23 Nov: Ship opened a second time 0.9 s after the first,
 * four signatures in flight, cancelled, and a "Could not load" report 1 ms later. That was every such report the
 * smoke test's accounts made (one a run), and it fits the ones from people: a reload while Ship was loading.
 *
 * `beforeunload` comes before the requests are cancelled, `pagehide` as the page goes. A page that stays after all
 * (a cancelled leave, or one brought back by Back) is told so by `pageshow`, or by the clock.
 */

/**
 * How long after a leave that did not happen a failure goes unreported: a link the browser gave up on (a mail
 * address, a download) tells the page it is leaving and never that it stayed. Longer than a page takes to be
 * replaced, short enough that a real failure soon after is still reported.
 */
export const LEAVE_HOLDS_MS = 10_000

let leavingUntil = 0
let watching = false

/** Starts watching the window for the page leaving; safe to call again. */
export function watchPageLeaving(target: Window = window): void {
  if (watching) return
  watching = true
  const leaves = () => {
    leavingUntil = Date.now() + LEAVE_HOLDS_MS
  }
  target.addEventListener('beforeunload', leaves)
  target.addEventListener('pagehide', leaves)
  target.addEventListener('pageshow', () => {
    leavingUntil = 0
  })
}

/** True from the moment the page starts to leave. */
export function pageIsLeaving(): boolean {
  return Date.now() < leavingUntil
}
