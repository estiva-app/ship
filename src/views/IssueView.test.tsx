/**
 * An archived issue is read, not edited — and still discussed (SHI-36).
 *
 * `readOnlyReason` shuts every write on the page, the composer included, so the
 * archived case needed a second reason that shuts the issue's own fields and
 * nothing else (Miky, 2026-10-05: comments stay open, Unarchive and Delete
 * stay). This pins the split at the view, where the two meet.
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WriteResult } from '@/api'
import { actInField } from '@/pages/act'
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

/*
  A file's summary on its own page (SUM-4, part 2), as the short-summary
  prototype draws it (Miky, 15 Oct): under the title, all of it, click to edit;
  "Add a summary" only to someone who can edit; text only when archived or
  read-only. A writer's tests wait for the editors' chunk first, so the header
  they act on is the one that stays.
*/
describe('the summary on an issue’s and a project’s page (SUM-4)', () => {
  const SUMMARY = 'Columns come back in the order they were made, not the order they were left.'
  const writer = async (extra: Partial<IssueViewProps>) => {
    render(view('overview', extra))
    await screen.findByRole('textbox', { name: 'Description' })
    return screen.queryByRole('button', { name: 'Edit summary' })
  }
  const box = () => screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement

  it('draws it under the title, and saves what is typed on Enter', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    const edit = await writer({ summary: SUMMARY, onSummarize })
    expect(edit?.textContent).toBe(SUMMARY)
    // Under the title and above the description, in reading order.
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(screen.getByRole('textbox', { name: 'Title' }), edit!)).toBe(true)
    expect(follows(edit!, screen.getByRole('textbox', { name: 'Description' }))).toBe(true)
    fireEvent.click(edit!)
    fireEvent.input(box(), { target: { value: 'The board keeps the order you left it in.' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith('The board keeps the order you left it in.'))
  })

  it('offers "Add a summary" to someone who can edit, and nothing to someone who cannot', async () => {
    const edit = await writer({ onSummarize: vi.fn() })
    expect(edit?.textContent).toBe('Add a summary')
    cleanup()
    render(view('overview', { onSummarize: vi.fn(), readOnlyReason: 'Sign in to edit.' }))
    expect(screen.queryByText('Add a summary')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit summary' })).toBeNull()
  })

  it('shows an archived issue’s summary as text, not something to click', () => {
    render(view('overview', { summary: SUMMARY, onSummarize: vi.fn(), lockedReason: 'Unarchive to edit' }))
    expect(screen.queryByText(SUMMARY)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit summary' })).toBeNull()
  })

  it('counts past 240 characters and saves all of it, refusing nothing; the count goes once it is saved', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    const edit = await writer({ summary: SUMMARY, onSummarize })
    expect(edit).not.toBeNull()
    fireEvent.click(edit!)
    const long = 'b'.repeat(300)
    fireEvent.input(box(), { target: { value: long } })
    expect(screen.queryByText('300 characters. A summary reads best in one or two sentences, under 240.')).not.toBeNull()
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith(long))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Summary' })).toBeNull())
    expect(screen.queryByText(/300 characters/)).toBeNull()
  })

  /* The page's own refusal path, `actInField`, runs for real: only the write's answer is made up. */
  const refusedBy = (write: () => Promise<WriteResult>) => () => actInField('Summary', write)
  const refuse = async (onSummarize: (value: string) => Promise<true | string>) => {
    const edit = await writer({ summary: SUMMARY, onSummarize })
    expect(edit).not.toBeNull()
    fireEvent.click(edit!)
    fireEvent.input(box(), { target: { value: 'A new summary the relay did not take.' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
  }

  it('keeps your text in the field with the reason when the relay refuses it, and Escape puts the saved one back', async () => {
    await refuse(refusedBy(async () => ({ ok: false, reason: 'rate-limited: quota exceeded; retry in 14s' })))
    await waitFor(() => expect(screen.queryByText('Summary not saved. Too busy right now — try again in 14s. Your text is still here.')).not.toBeNull())
    expect(box().value).toBe('A new summary the relay did not take.')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Edit summary' })?.textContent).toBe(SUMMARY)
    expect(screen.queryByText(/Summary not saved/)).toBeNull()
  })

  it('says the relay’s own words for a refusal, as one sentence', async () => {
    await refuse(refusedBy(async () => ({ ok: false, reason: 'restricted: not a channel member' })))
    await waitFor(() => expect(screen.queryByText('Summary not saved. restricted: not a channel member. Your text is still here.')).not.toBeNull())
    expect(box().value).toBe('A new summary the relay did not take.')
  })

  it('says a reason even when the relay gave none, or the write threw, and keeps your text', async () => {
    await refuse(refusedBy(async () => ({ ok: false, reason: '' })))
    await waitFor(() => expect(screen.queryByText('Summary not saved. The relay gave no reason. Your text is still here.')).not.toBeNull())
    cleanup()
    await refuse(refusedBy(async () => {
      throw new Error('network down')
    }))
    await waitFor(() => expect(screen.queryByText('Summary not saved. network down. Your text is still here.')).not.toBeNull())
    expect(box().value).toBe('A new summary the relay did not take.')
  })

  it('clears it when emptied, and saves line breaks as spaces', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    const edit = await writer({ summary: SUMMARY, onSummarize })
    expect(edit).not.toBeNull()
    fireEvent.click(edit!)
    fireEvent.input(box(), { target: { value: 'Two\nlines' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith('Two lines'))
    cleanup()
    const again = await writer({ summary: SUMMARY, onSummarize })
    fireEvent.click(again!)
    fireEvent.input(box(), { target: { value: '   ' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(onSummarize).toHaveBeenLastCalledWith(''))
  })

  it('draws a project’s summary under its title, editable', async () => {
    render(projectView('overview', { header: { title: 'Relay Migration', summary: SUMMARY, onSummarize: vi.fn(), description: 'Move every Folder.', descriptionFormat: 'marker', archived: false, onRename: vi.fn(), onDescribe: vi.fn() } }))
    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('button', { name: 'Edit summary' })?.textContent).toBe(SUMMARY)
  })
})
