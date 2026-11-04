import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArchivedNotice } from '@estiva-app/ui'
import { archivedNoticeOf } from './archive'

const NOW = Date.now() / 1000

describe('the archived card, in Ship’s words (FOL-46)', () => {
  it('names who archived it and says when as Ship says a time', () => {
    render(<ArchivedNotice {...archivedNoticeOf({ by: 'a'.repeat(64), at: NOW - 3 * 3600, resolution: 'Shipped.' }, () => 'Ana')} />)
    expect(screen.getByText('Archived by Ana · 3h ago')).toBeTruthy()
    expect(screen.getByText('Shipped.')).toBeTruthy()
  })

  it('archived with its Folder, names the Folder as a proper noun and opens it', () => {
    const open = vi.fn()
    render(
      <ArchivedNotice
        {...archivedNoticeOf({ by: 'a'.repeat(64), at: NOW - 60, with: { kind: 'folder', addr: '39000:a:steer', title: 'Steer', id: 'steer' } }, () => 'Ana')}
        onOpenParent={open}
      />,
    )
    expect(screen.getByText('Archived with its team “Steer” by Ana · 1m ago')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open team' }))
    expect(open).toHaveBeenCalled()
  })
})
