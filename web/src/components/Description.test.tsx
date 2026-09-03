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
import { render, screen, fireEvent } from '@testing-library/react'

// The reference resolver reaches the relay. What is under test is which text
// reaches the screen, so it is stubbed to resolve nothing — `ForeignReferences`
// draws its own empty state and the prose is unaffected either way.
vi.mock('@/api/foreign', () => ({ resolveForeign: vi.fn(async () => []) }))

import { Description } from './Description'

const NADDR =
  'nostr:naddr1qqjxzde5xfjnvdee943kzwrr956rswr995uxgd3s95unsvekvd3nsvtzv3jnyqg4dp68gup69uhkcmmrv9kxsmmnwsarxvpsxqpzpvankwem8vankwem8vankwem8vankwem8vankwem8vankwem8vanqvzqqqrcsvczkget'

const show = (value: string) =>
  render(<Description value={value} format="marker" onCommit={() => true} />).container

describe('Description', () => {
  it('keeps the pointer out of the prose', () => {
    const c = show(`See ${NADDR} for the detail.`)
    expect(c.textContent).not.toContain('naddr1')
    expect(c.textContent).toContain('See')
    expect(c.textContent).toContain('for the detail.')
  })

  it('still edits the text that was written, pointer included', () => {
    // The pointer is hidden from the *reading*, never from the author. A naive
    // `value={stripped}` would delete it the first time anyone edited around it.
    show(`See ${NADDR} for the detail.`)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toContain('naddr1')
  })

  it('renders structure as well', () => {
    const c = show('# Title\n\n- one\n- two')
    expect(c.querySelectorAll('li')).toHaveLength(2)
  })

  it('shows the placeholder when there is nothing yet', () => {
    expect(show('').textContent).toContain('Add a description…')
  })

  it('offers no edit affordance to a reader who cannot write', () => {
    render(<Description value="text" format="marker" onCommit={() => true} readOnly />)
    expect(screen.queryByRole('button', { name: /edit description/i })).toBeNull()
  })
})
