/**
 * The fields are drawn once (ONE-6 follow-up, 3 November): the editors arriving replaces the title and the
 * description, never the fields between them. Drawn in both halves of one swap, they were drawn again when the
 * editors landed, and a picker opened in the moment before closed under the person's pointer.
 *
 * Its own file because the test must render before the editors' chunk has loaded: once a file has loaded it, a
 * render never shows the reading surface again.
 */
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { stubLayout } from '@/test/inlineText'
import { LiveHeader } from './LiveHeader'

/** A pill with a picker, as small as it gets: pressed, it stays open until something draws it again. */
function Fields() {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
      Status
    </button>
  )
}

describe('LiveHeader, its fields while the editors arrive', () => {
  stubLayout()

  it('keeps a picker opened before the editors arrive open once they have', async () => {
    render(
      <LiveHeader
        title="Board columns out of order"
        titlePlaceholder="Untitled issue"
        onRename={vi.fn(() => true)}
        summary="Columns come back in the order they were made."
        onSummarize={vi.fn(async () => true as const)}
        description="The board draws its columns in the wrong order."
        format="marker"
        onDescribe={vi.fn(() => true)}
        fields={<Fields />}
      />,
    )
    expect(document.querySelector('[data-description="reading"]')).not.toBeNull()
    const pill = screen.getByRole('button', { name: 'Status' })
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')

    await screen.findByRole('textbox', { name: 'Description' }, { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'Status' })).toBe(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
  })
})
