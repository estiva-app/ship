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
import { ProjectView, type ProjectViewProps } from './ProjectView'

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

const projectView = (tab: 'overview' | 'activity', extra: Partial<ProjectViewProps>) => (
  <ProjectView
    crumbs={{ projectsHref: '/projects', title: 'Relay Migration' }}
    header={{ title: 'Relay Migration', description: 'Move every Folder to the new relay.', descriptionFormat: 'marker', archived: true, onRename: vi.fn(), onDescribe: vi.fn() }}
    onAddIssue={vi.fn()}
    tab={tab}
    onTab={vi.fn()}
    view="table"
    onView={vi.fn()}
    issues={[]}
    issueStatuses={[]}
    hrefFor={() => '#'}
    threads={[]}
    onStartConversation={vi.fn()}
    onReply={vi.fn()}
    activity={[]}
    onReplyInActivity={vi.fn()}
    rail={{ status: 'planned', statuses: [{ value: 'planned', label: 'Planned' }], onStatusChange: vi.fn(), lead: '', people: [], onLeadChange: vi.fn(), done: 0, total: 0, folders: [], archived: true, onArchive: vi.fn(), onDelete: vi.fn() }}
    {...extra}
  />
)

describe('ProjectView, archived (SHI-36)', () => {
  it('draws the description without an editor and shuts Add issue, leaving Unarchive and Delete', () => {
    render(projectView('overview', { lockedReason: 'Unarchive to edit' }))
    expect(screen.getByText(/Move every Folder to the new relay/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add issue' }).getAttribute('aria-disabled')).toBe('true')
    for (const name of ['Unarchive project', 'Delete project']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe(null)
  })

  it('keeps the composer open', () => {
    render(projectView('activity', { lockedReason: 'Unarchive to edit' }))
    expect(screen.getByText('Start a conversation or type')).toBeInTheDocument()
  })
})

describe('the Activity tab says when its conversation has something new (66b31c4b)', () => {
  /* Overview does not read the conversation any more, so it is the tab that tells you. */
  it('lights Activity on an issue with an unread thread, and not without one', () => {
    const { unmount } = render(view('overview', { unread: { t1: ['m1'] }, stillUnread: { t1: ['m1'] } }))
    expect(screen.getByRole('tab', { name: /^Activity.*new$/ }).querySelector('[data-unread]')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Overview' }).querySelector('[data-unread]')).toBeNull()
    unmount()
    render(view('overview', { unread: {}, stillUnread: {} }))
    expect(screen.getByRole('tab', { name: 'Activity' }).querySelector('[data-unread]')).toBeNull()
  })

  /* `unread` is held for the visit so the "new since" line stays while you read
     (99557309); the dot answers to what is unread now, so it goes once read. */
  it('puts the dot out once the dwell has read it, though the divider stays', () => {
    render(view('activity', { unread: { t1: ['m1'] }, stillUnread: {} }))
    expect(screen.getByRole('tab', { name: 'Activity' }).querySelector('[data-unread]')).toBeNull()
  })

  it('lights Activity on a project the same way, and never Issues', () => {
    render(projectView('overview', { unread: { t1: ['m1'] }, stillUnread: { t1: ['m1'] } }))
    expect(screen.getByRole('tab', { name: /^Activity.*new$/ }).querySelector('[data-unread]')).not.toBeNull()
    expect(screen.getByRole('tab', { name: /^Issues/ }).querySelector('[data-unread]')).toBeNull()
  })
})
