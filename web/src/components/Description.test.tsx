/**
 * A description shows the object it points at, not the pointer — PRO-7.
 *
 * This file exists because the behaviour was assembled by hand at two call
 * sites and one of them was assembled wrong: an issue's description stripped
 * its `nostr:naddr…` and drew the object below; a project's did neither. Both
 * surfaces passed every test, because nothing was *broken* — one simply lacked
 * a feature the other had, and no test knew they were meant to match.
 *
 * So the assertions here are about the pairing, and `ProjectHeader.test.tsx`
 * checks that the project surface actually mounts it.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The reference resolver reaches the relay. What is under test is which text
// reaches the screen, so it is stubbed to resolve nothing — `ForeignReferences`
// draws its own empty state and the prose is unaffected either way.
// Only the network call is stubbed. `Description` renders `ForeignObject` for a
// standalone reference, which needs the rest of this module.
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))

import { Description } from './Description'

const NADDR =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'

const show = (value: string) =>
  render(<Description value={value} format="marker" onCommit={() => true} />).container

describe('Description', () => {
  /*
    RIC-9 asserted that no `naddr1` appeared in the prose at all, because every
    pointer was cut out of the body before rendering. RIC-10 changes that
    deliberately: a pointer *inside a sentence* is now drawn in place, so the
    sentence survives.

    The property that still holds, and the one worth asserting, is that a reader
    never sees a raw full-length pointer. Unresolved it is a shortened chip
    (§13.1: never blank); resolved it is the object's title.
  */
  it('draws a mid-sentence pointer in place, keeping the sentence', () => {
    const c = show(`See ${NADDR} for the detail.`)
    expect(c.textContent).toContain('See')
    expect(c.textContent).toContain('for the detail.')
    expect(c.querySelector('[data-reference]')).not.toBeNull()
    // Shortened, not the 200-character pointer the author typed.
    expect(c.textContent!.length).toBeLessThan(NADDR.length)
  })

  it('keeps a pointer that is the whole paragraph out of the prose', () => {
    // The attachment variant: alone on its line it is drawn below the text, so
    // it leaves the prose entirely. That is RIC-9's behaviour, still true for
    // the case RIC-9 was actually about.
    const c = show(NADDR)
    expect(c.textContent).not.toContain('naddr1')
  })

  it('opens an editor that still holds the pointer, drawn as what it points at', async () => {
    /*
      The pointer is hidden from the *reading* and never from the author: a
      naive `value={stripped}` would delete it the first time anyone edited
      around it.

      RIC-14 changes how that is checked rather than whether. There is no
      second string any more — the editor holds the same document the reader
      does — so the assertion is that the reference is still *in* the editor,
      as the chip it is drawn as, instead of reappearing as raw bech32 the
      moment a person clicks. That difference was the whole report.
    */
    show(`See ${NADDR} for the detail.`)
    // The reading surface is the way in (D37): a click on the prose opens it.
    fireEvent.click(screen.getByText(/for the detail/))

    // `findBy`, because the editor is a lazy chunk: a reader never downloads
    // ProseMirror, so the first click is what fetches it. The wait is for
    // that chunk, not for the UI, and in a full run it has taken 1.1–1.7s
    // against findBy's 1s default — the flake of 2026-09-09, three times.
    const editor = await screen.findByRole('textbox', { name: 'Description' }, { timeout: 5000 })
    expect(editor.textContent).toContain('See')
    expect(editor.textContent).toContain('for the detail.')
    // A node view is a React portal, so it lands a tick after the editor does.
    await waitFor(() => expect(editor.querySelector('[data-reference]')).not.toBeNull())
    // Not the 200-character pointer, which is what a textarea showed.
    expect(editor.textContent!.length).toBeLessThan(NADDR.length)
  })

  it('renders structure as well', () => {
    const c = show('# Title\n\n- one\n- two')
    expect(c.querySelectorAll('li')).toHaveLength(2)
  })

  it('shows the placeholder when there is nothing yet', () => {
    expect(show('').textContent).toContain('Add a description…')
  })

  it('offers no edit affordance to a reader who cannot write', () => {
    const c = render(<Description value="text" format="marker" onCommit={() => true} readOnly />).container
    // No focusable surface either: a reader who cannot write gets no way in (D37).
    expect(c.querySelector('[tabindex="0"]')).toBeNull()
    // And clicking the prose does nothing: the affordance is the only way in,
    // so removing it has to remove the capability rather than only the button.
    fireEvent.click(c.querySelector('p')!)
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })
})
