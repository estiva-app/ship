import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveDialog } from './ArchiveDialog'

/** The question's form (1 October): Ctrl+Enter sends the resolution, a refusal keeps it open, Escape closes it. */
describe('ArchiveDialog', () => {
  it('archives from the resolution with Ctrl+Enter, and closes when it is done', async () => {
    const onArchive = vi.fn(async () => true)
    const onClose = vi.fn()
    render(<ArchiveDialog title="T" what="project" hides={[]} onClose={onClose} onArchive={onArchive} />)
    await userEvent.type(screen.getByLabelText('Resolution (optional)'), '  Merged  {Control>}{Enter}{/Control}')
    expect(onArchive).toHaveBeenCalledWith('Merged')
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('stays open when the archive is refused', async () => {
    const onClose = vi.fn()
    render(<ArchiveDialog title="T" what="project" hides={[]} onClose={onClose} onArchive={async () => false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Archive project' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Archive project' })).toBeEnabled()
  })

  it('closes on Escape, even with the cursor in the resolution', async () => {
    const onClose = vi.fn()
    render(<ArchiveDialog title="T" what="project" hides={[]} onClose={onClose} onArchive={async () => true} />)
    await userEvent.type(screen.getByLabelText('Resolution (optional)'), 'half a thought{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
