/**
 * An archived issue is read, not edited — and still discussed (SHI-36).
 *
 * `readOnlyReason` shuts every write on the page, the composer included, so the
 * archived case needed a second reason that shuts the issue's own fields and
 * nothing else (Miky, 2026-10-05: comments stay open, Unarchive and Delete
 * stay). This pins the split at the view, where the two meet.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor } from '@tiptap/core'
import type { WriteResult } from '@/api'
import { leave, press, rewrite, stubLayout, typeAtEnd } from '@/test/inlineText'
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
    Changed on purpose (COMM-7, Decided 2026-10-17, reversing SHI-36's
    "comments stay open"): an archived issue takes no new comment, and the box
    is a line in its place saying why. The box is its own chunk, so `findBy`.
  */
  it('shows a line saying it is archived where the box was, and no box', async () => {
    render(view('activity', { lockedReason: 'Unarchive to edit', commentsClosed: 'Archived. Unarchive it to comment.' }))
    expect(await screen.findByText('Archived. Unarchive it to comment.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Start a conversation…' })).toBeNull()
    expect(screen.queryByText('Start a conversation or type')).toBeNull()
  })

  it('shows the same line, saying why, when nothing on the page may be written', async () => {
    render(view('activity', { readOnlyReason: 'Sign in to reply.' }))
    expect(await screen.findByText('Sign in to reply.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Start a conversation…' })).toBeNull()
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
  // Changed on purpose (PEEKM-2, Decided 2026-10-23): no new issue is offered under an archived project, so the page passes no onAddIssue.
  it('draws the description without an editor and offers no Add issue, leaving Unarchive and Delete', () => {
    render(projectView('overview', { lockedReason: 'Unarchive to edit', onAddIssue: undefined }))
    expect(screen.getByText(/Move every Folder to the new relay/)).toBeInTheDocument()
    // Changed on purpose (WBD-7): the description is the shared editor, only read, so nothing in it can be written.
    expect(document.querySelector('[contenteditable="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add issue' })).toBeNull()
    for (const name of ['Unarchive project', 'Delete project']) expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe(null)
  })

  // Changed on purpose (COMM-7, Decided 2026-10-17): an archived project's chat takes no new message either.
  it('shows a line saying it is archived where the chat box was', async () => {
    render(projectView('activity', { lockedReason: 'Unarchive to edit', commentsClosed: 'Archived. Unarchive it to comment.' }))
    expect(await screen.findByText('Archived. Unarchive it to comment.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Start a conversation…' })).toBeNull()
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
  prototype draws it (Miky, 15 Oct), edited where it stands as in a document
  (Miky, 16 Oct): under the title, all of it, the text itself editable, with
  no box and no button; "Add a summary" only to someone who can edit; text
  only when archived or read-only. A writer's tests wait for the editors'
  chunk first, so the header they act on is the one that stays.
*/
describe('the summary on an issue’s and a project’s page (SUM-4)', () => {
  stubLayout()
  const SUMMARY = 'Columns come back in the order they were made, not the order they were left.'
  const writer = async (extra: Partial<IssueViewProps>) => {
    render(view('overview', extra))
    await screen.findByRole('textbox', { name: 'Description' })
    return screen.queryByRole('textbox', { name: 'Summary' })
  }
  const box = () => screen.getByRole('textbox', { name: 'Summary' })

  it('draws it under the title as editable text, no button to open it, and saves what is typed on Enter', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    const edit = await writer({ summary: SUMMARY, onSummarize })
    expect(edit?.textContent).toBe(SUMMARY)
    expect(edit?.getAttribute('contenteditable')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Edit summary' })).toBeNull()
    // Under the title and above the description, in reading order.
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(screen.getByRole('textbox', { name: 'Title' }), edit!)).toBe(true)
    expect(follows(edit!, screen.getByRole('textbox', { name: 'Description' }))).toBe(true)
    await rewrite(box(), 'The board keeps the order you left it in.')
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith('The board keeps the order you left it in.'))
  })

  /* jsdom draws no format toolbar, so these read what opens it: a selection rather than a caret. */
  const caretInDescription = async () => {
    const description = screen.getByRole('textbox', { name: 'Description' })
    await waitFor(() => expect(document.activeElement).toBe(description))
    const { selection } = (description as HTMLElement & { editor: Editor }).editor.state
    return selection.empty && selection.$from.parent.isTextblock
  }

  it('goes on from Enter into an empty description with a caret, not the whole of it selected', async () => {
    await writer({ summary: SUMMARY, description: '', onSummarize: vi.fn().mockResolvedValue(true) })
    await typeAtEnd(box(), '!')
    await press(box(), 'Enter')
    expect(await caretInDescription()).toBe(true)
  })
  it('saves on Escape and on leaving it, keeping what was typed', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    await writer({ summary: SUMMARY, onSummarize })
    await typeAtEnd(box(), ' Again.')
    await press(box(), 'Escape')
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith(`${SUMMARY} Again.`))
    expect(box().textContent).toBe(`${SUMMARY} Again.`)
    await typeAtEnd(box(), ' Once more.')
    await leave(box())
    await waitFor(() => expect(onSummarize).toHaveBeenLastCalledWith(`${SUMMARY} Again. Once more.`))
  })

  it('writes a change straight back to the old summary, before the page has caught up with the first save', async () => {
    // The page's summary stays SUMMARY: the store has not refreshed after the first save.
    const onSummarize = vi.fn().mockResolvedValue(true)
    await writer({ summary: SUMMARY, onSummarize })
    await rewrite(box(), 'A first try.')
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith('A first try.'))
    await rewrite(box(), SUMMARY)
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenLastCalledWith(SUMMARY))
  })

  it('offers "Add a summary" to someone who can edit, and nothing to someone who cannot', async () => {
    const edit = await writer({ onSummarize: vi.fn() })
    expect(edit?.textContent).toBe('')
    expect(screen.queryByText('Add a summary')).not.toBeNull()
    cleanup()
    render(view('overview', { onSummarize: vi.fn(), readOnlyReason: 'Sign in to edit.' }))
    expect(screen.queryByText('Add a summary')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Summary' })).toBeNull()
  })

  it('shows an archived issue’s summary as text, not something to edit', () => {
    render(view('overview', { summary: SUMMARY, onSummarize: vi.fn(), lockedReason: 'Unarchive to edit' }))
    expect(screen.queryByText(SUMMARY)).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Summary' })).toBeNull()
  })

  it('counts past 240 characters and saves all of it, refusing nothing; the count goes when you leave it', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    await writer({ summary: SUMMARY, onSummarize })
    const long = 'b'.repeat(300)
    await rewrite(box(), long)
    expect(screen.queryByText('300 characters. A summary reads best in one or two sentences, under 240.')).not.toBeNull()
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith(long))
    await leave(box())
    expect(screen.queryByText(/300 characters/)).toBeNull()
  })

  /* The page's own refusal path, `actInField`, runs for real: only the write's answer is made up. */
  const refusedBy = (write: () => Promise<WriteResult>) => () => actInField('Summary', write)
  const refuse = async (onSummarize: (value: string) => Promise<true | string>) => {
    await writer({ summary: SUMMARY, onSummarize })
    await rewrite(box(), 'A new summary the relay did not take.')
    await press(box(), 'Enter')
    // Enter moves into the description a frame later (the editor's focus waits for one): wait for it, or under
    // CI's load it lands after the test has clicked back into the summary, and saves the summary from under it.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Description' })))
  }

  it('keeps your text where you wrote it with the reason when the relay refuses it, until you change it', async () => {
    const write = vi.fn(async (): Promise<WriteResult> => ({ ok: false, reason: 'rate-limited: quota exceeded; retry in 14s' }))
    await refuse(refusedBy(write))
    await waitFor(() => expect(screen.queryByText('Summary not saved. Too busy right now — try again in 14s. Your text is still here.')).not.toBeNull())
    expect(box().textContent).toBe('A new summary the relay did not take.')
    // Coming back and leaving tries again, and is refused again: the text and the reason stay.
    const tries = write.mock.calls.length
    await act(async () => box().focus())
    await leave(box())
    await waitFor(() => expect(write).toHaveBeenCalledTimes(tries + 1))
    expect(box().textContent).toBe('A new summary the relay did not take.')
    expect(screen.queryByText(/Summary not saved/)).not.toBeNull()
    // Changing it is a new attempt: the old reason goes.
    await typeAtEnd(box(), '!')
    expect(screen.queryByText(/Summary not saved/)).toBeNull()
  })

  it('says nothing about a refusal that arrives after you changed the text', async () => {
    let answer: (result: WriteResult) => void = () => {}
    await refuse(refusedBy(() => new Promise<WriteResult>((resolve) => (answer = resolve))))
    await typeAtEnd(box(), ' More.')
    await act(async () => answer({ ok: false, reason: 'rate-limited: quota exceeded; retry in 14s' }))
    expect(box().textContent).toBe('A new summary the relay did not take. More.')
    expect(screen.queryByText(/Summary not saved/)).toBeNull()
  })

  it('says the relay’s own words for a refusal, as one sentence', async () => {
    await refuse(refusedBy(async () => ({ ok: false, reason: 'restricted: not a channel member' })))
    await waitFor(() => expect(screen.queryByText('Summary not saved. restricted: not a channel member. Your text is still here.')).not.toBeNull())
    expect(box().textContent).toBe('A new summary the relay did not take.')
  })

  it('says a reason even when the relay gave none, or the write threw, and keeps your text', async () => {
    await refuse(refusedBy(async () => ({ ok: false, reason: '' })))
    await waitFor(() => expect(screen.queryByText('Summary not saved. The relay gave no reason. Your text is still here.')).not.toBeNull())
    cleanup()
    await refuse(refusedBy(async () => {
      throw new Error('network down')
    }))
    await waitFor(() => expect(screen.queryByText('Summary not saved. network down. Your text is still here.')).not.toBeNull())
    expect(box().textContent).toBe('A new summary the relay did not take.')
  })

  it('clears it when emptied, and saves pasted line breaks as spaces', async () => {
    const onSummarize = vi.fn().mockResolvedValue(true)
    await writer({ summary: SUMMARY, onSummarize })
    await rewrite(box(), '')
    await userEvent.paste('Two\nlines')
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith('Two lines'))
    cleanup()
    await writer({ summary: SUMMARY, onSummarize })
    await rewrite(box(), '')
    await press(box(), 'Enter')
    await waitFor(() => expect(onSummarize).toHaveBeenLastCalledWith(''))
  })

  it('draws a project’s summary under its title, editable', async () => {
    render(projectView('overview', { header: { title: 'Relay Migration', summary: SUMMARY, onSummarize: vi.fn(), description: 'Move every Folder.', descriptionFormat: 'marker', archived: false, onRename: vi.fn(), onDescribe: vi.fn() } }))
    await screen.findByRole('textbox', { name: 'Description' })
    expect(screen.queryByRole('textbox', { name: 'Summary' })?.textContent).toBe(SUMMARY)
  })
})
