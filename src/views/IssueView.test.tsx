/**
 * An archived issue is read, not edited — and still discussed (SHI-36).
 *
 * `readOnlyReason` shuts every write on the page, the composer included, so the
 * archived case needed a second reason that shuts the issue's own fields and
 * nothing else (Miky, 2026-10-05: comments stay open, Unarchive and Delete
 * stay). This pins the split at the view, where the two meet.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssueView, type IssueViewProps } from './IssueView'

const view = (tab: 'overview' | 'activity', extra: Partial<IssueViewProps>) => (
  <IssueView
    crumbs={{ issuesHref: '/issues' }}
    tab={tab}
    onTab={vi.fn()}
    title="Board columns out of order"
    description="The board draws its columns in the wrong order."
    descriptionFormat="marker"
    onRename={vi.fn()}
    onDescribe={vi.fn()}
    threads={[]}
    onStartConversation={vi.fn()}
    onReply={vi.fn()}
    activity={[]}
    onReplyInActivity={vi.fn()}
    history={[]}
    rail={{
      status: 'todo',
      statuses: [{ value: 'todo', label: 'Todo' }],
      onStatusChange: vi.fn(),
      assignee: '',
      people: [],
      onAssigneeChange: vi.fn(),
      project: '',
      projects: [{ value: '', label: 'No project' }],
      onProjectChange: vi.fn(),
      openedBy: {},
      openedAt: Math.floor(Date.now() / 1000),
      onCopyReference: vi.fn(),
      archived: true,
      onArchive: vi.fn(),
      onDelete: vi.fn(),
    }}
    {...extra}
  />
)

describe('IssueView, archived (SHI-36)', () => {
  it('draws the description without an editor and shuts the rail’s fields, leaving Unarchive and Delete', () => {
    render(view('overview', { lockedReason: 'Unarchive to edit' }))
    expect(screen.getByText(/draws its columns in the wrong order/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Status' }).getAttribute('aria-disabled')).toBe('true')
    for (const name of ['Unarchive issue', 'Delete issue']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe(null)
  })

  /*
    The composer's editor is its own chunk; until it lands, its shell draws the
    box's words — the invitation when it may be written, the reason when not.
    That shell is what these read, so they hold without loading ProseMirror.
  */
  it('keeps the composer open: a reader can still start a conversation', () => {
    render(view('activity', { lockedReason: 'Unarchive to edit' }))
    expect(screen.getByText('Start a conversation or type')).toBeInTheDocument()
    expect(screen.queryByText('Unarchive to edit')).toBeNull()
  })

  it('still shuts the composer when nothing on the page may be written', () => {
    render(view('activity', { readOnlyReason: 'Sign in to reply.' }))
    expect(screen.getByText('Sign in to reply.')).toBeInTheDocument()
    expect(screen.queryByText('Start a conversation or type')).toBeNull()
  })
})
