import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceState } from '@/api'

const { ME, OTHER } = vi.hoisted(() => ({ ME: 'e'.repeat(64), OTHER: 'f'.repeat(64) }))

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    me: ME,
    useWorkspace: vi.fn(),
    useDirectory: vi.fn(),
    resolveInbound: vi.fn(),
    createProject: vi.fn(),
    createIssue: vi.fn(),
    setIssueField: vi.fn(),
    setProjectField: vi.fn(),
    archiveProject: vi.fn(),
    deleteProject: vi.fn(),
    deleteIssue: vi.fn(),
    startConversation: vi.fn(),
    // The listing read is the relay's; here the project lists in its own Folder.
    workFolder: vi.fn(async (project: { contentFolder: string }) => project.contentFolder),
    reply: vi.fn(),
  }
})

/* A Folder is read through the projection layer, not the workspace: held
   pending here, so the folder page stays in its own loading state. */
vi.mock('@/api/foreign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/foreign')>()),
  readFolder: vi.fn(() => new Promise(() => {})),
  // One team, so a new project has somewhere to be filed (FOL-2); its state lists Live, so the rail names it (FOL-3).
  readFolders: vi.fn(() =>
    Promise.resolve([{ id: '3167adea-877f-43c4-96fb-517a2b2d5d24', name: 'Ship', hasState: true, addresses: ['30850:x:00000000-0000-4000-8000-000000000001'] }]),
  ),
}))

import { archiveProject, createIssue, createProject, deleteIssue, deleteProject, resolveInbound, setIssueField, startConversation, useDirectory, useWorkspace } from '@/api'
import { fireEvent } from '@testing-library/react'
import App, { sidebarProps } from './App'

/**
 * Fixture identities are real uuids, because a route now carries the `d` alone
 * (RFC 0.5 §7.2) and `identifierFromRef` reads it off the tail. An `id` like
 * `30850:x:live` builds a path that parses back to nothing, so a test using one
 * would land on the issue list and look like a routing bug.
 */
const D = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
const LIVE = D('01')
const OLD = D('02')
const MINE = D('03')

// `archived` and the field it is folded from, together, as the fold writes them (FOL-46 reads the field).
const project = (d: string, title: string, archived = false) => ({
  addr: `30850:x:${d}`, id: d, author: OTHER, createdAt: 1, title, description: '', descriptionFormat: 'marker' as const, contentFolder: 'f', status: 'planned', archived,
  fields: (archived ? { archived: { value: 'true', by: OTHER, at: 1, format: 'marker' as const } } : {}) as WorkspaceState['projects'][number]['fields'],
})
const issue = (d: string, projectAddr: string | undefined, status: string) => ({
  addr: `30851:x:${d}`, id: d, author: OTHER, createdAt: 1, title: `issue ${d.slice(-2)}`, description: '', descriptionFormat: 'marker' as const, folder: 'f', projectAddr, status, fields: {},
})

const STATE: WorkspaceState = {
  projects: [project(LIVE, 'Live'), project(OLD, 'Old', true), { ...project(MINE, 'Mine'), author: ME, lead: OTHER }],
  issues: [
    issue(D('11'), `30850:x:${LIVE}`, 'todo'),
    issue(D('12'), `30850:x:${LIVE}`, 'done'),
    issue(D('13'), `30850:x:${OLD}`, 'todo'),
    { ...issue(D('14'), undefined, 'in_progress'), assignee: ME, ref: 'X-4' },
  ],
  activity: [
    { id: 'ch1', author: OTHER, createdAt: 99, target: `30851:x:${D('11')}`, field: 'status', value: 'todo', note: '', format: 'marker' as const },
    { id: 'ch2', author: OTHER, createdAt: 100, target: `30851:x:${D('14')}`, field: 'assignee', value: ME, note: '', format: 'marker' as const },
    { id: 'ch3', author: ME, createdAt: 101, target: `30851:x:${D('14')}`, field: 'status', value: 'in_progress', note: '', format: 'marker' as const },
  ],
  conversations: [
    { id: 'c1', root: { id: 'c1', author: OTHER, createdAt: 5, body: 'hi nostr:naddr1qqxyz', folder: 'f', about: [`30851:x:${D('14')}`] }, replies: [], about: [`30851:x:${D('14')}`], createdAt: 5, lastAt: 5 },
    { id: 'c2', root: { id: 'c2', author: ME, createdAt: 6, body: 'about the project', folder: 'f', about: [] }, replies: [{ id: 'c3', author: OTHER, createdAt: 7, body: 'reply', folder: 'f', about: [] }], about: [], createdAt: 6, lastAt: 7 },
  ],
  // `c1` names the issue in its *tags*, so it is that issue's own comment
  // rather than a passing mention of it — SPEC §6.4, CON-7.
  anchors: { c1: [`30851:x:${D('14')}`] },
  // No edits in the fixture: an unedited workspace is the ordinary case, and
  // `edits.test.ts` covers the fold itself (CON-4).
  edits: {},
  // Nor attachments: `scripts/attachments.test.ts` covers the fold and
  // `ui/Attachment.test.tsx` the drawing (CON-12).
  attachments: {},
  folders: [],
}

const refresh = vi.fn().mockResolvedValue(undefined)

const goTo = (path: string) => {
  history.replaceState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}

beforeEach(() => {
  goTo('/')
  refresh.mockClear()
  for (const write of [createProject, createIssue, setIssueField, archiveProject, deleteProject, deleteIssue, startConversation]) vi.mocked(write).mockReset()
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, loading: false, busy: false, refresh , live: false })
  vi.mocked(useDirectory).mockReturnValue({
    directory: new Map(),
    nameOf: (k: string) => (k === ME ? 'Me Myself' : 'Someone'),
    personOf: (k: string) => ({ name: k === ME ? 'Me Myself' : 'Someone' }),
    profileOf: () => undefined,
  })
  vi.mocked(resolveInbound).mockReset()
})

describe('sidebarProps — the old app\'s counting rules', () => {
  it('counts open issues outside archived projects, and open issues per active project', () => {
    const props = sidebarProps(STATE, { name: 'issues' })
    // 1 (todo, live) + 4 (in_progress, no project); 2 is done, 3 is in an archived project.
    expect(props.openIssues).toBe(2)
    expect(props.projects.map((p) => [p.title, p.openCount])).toEqual([['Live', 1], ['Mine', 0]])
    expect(props.current).toBe('issues')
  })

  it('marks the open project as current', () => {
    expect(sidebarProps(STATE, { name: 'project', d: LIVE, view: 'table' }).current).toEqual({ projectAddr: `30850:x:${LIVE}` })
  })
})

describe('App — the shell around the route', () => {
  it('shows the viewer by name, the counts from the relay, and canonicalises an empty hash', async () => {
    render(<App />)
    expect(within(screen.getByRole('banner')).getByText('Me Myself')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Issues/ })).toHaveTextContent('2')
    await waitFor(() => expect(location.pathname).toBe('/issues'))
  })

  it('shows the read error as a banner and keeps the shell', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: 'relay refused', loading: false, busy: false, refresh: async () => {} , live: false })
    render(<App />)
    expect(screen.getByText(/Could not read from the relay — relay refused/)).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Me Myself')).toBeInTheDocument()
  })

  it('lands an inbound reference on the object it names', async () => {
    vi.mocked(resolveInbound).mockResolvedValue({ addr: `30851:x:${D('11')}`, kind: 'issue' })
    goTo('/o/naddr1abc')
    render(<App />)
    // The address it resolved to becomes a §7.2 path — the `d` alone.
    await waitFor(() => expect(location.pathname).toBe(`/issue/${D('11')}`))
    expect(resolveInbound).toHaveBeenCalledWith('naddr1abc')
  })

  it('falls back to the issue list, with a reason, when the reference cannot be resolved', async () => {
    vi.mocked(resolveInbound).mockResolvedValue(null)
    goTo('/o/naddr1unknown')
    render(<App />)
    await waitFor(() => expect(location.pathname).toBe('/issues'))
    expect(screen.getByText(/Could not resolve that reference/)).toBeInTheDocument()
  })
})

describe('Projects page — cards from the fold', () => {
  it('draws the active projects with their counts, and the archived one behind the tab', () => {
    goTo('/projects')
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(main.getByRole('link', { name: /Live/ })).toHaveTextContent('2 issues')
    expect(main.queryByRole('link', { name: /Old/ })).not.toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Add project' })).toBeEnabled()
  })

  it('creates a project through the dialog, then re-reads the relay and says so', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, addr: '30850:x:new' })
    goTo('/projects')
    render(<App />)
    await screen.findByText('Ship') // the teams read has landed: the sidebar lists it
    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New project' }))
    fireEvent.change(dialog.getByPlaceholderText('New project title'), { target: { value: 'Mobile app' } })
    await userEvent.click(dialog.getByRole('combobox', { name: 'Folder' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Ship' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ title: 'Mobile app', description: '', team: { folder: '3167adea-877f-43c4-96fb-517a2b2d5d24', hasState: true } }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(await screen.findByText('Project created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument())
  })

  it('keeps the dialog open and says why when the relay refuses', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: false, reason: 'not a channel member' })
    goTo('/projects')
    render(<App />)
    await screen.findByText('Ship')
    fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New project' }))
    fireEvent.change(dialog.getByPlaceholderText('New project title'), { target: { value: 'X' } })
    await userEvent.click(dialog.getByRole('combobox', { name: 'Folder' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Ship' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText(/Project rejected — not a channel member/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the archived list when the route asks for it', () => {
    goTo('/projects?archived')
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: /Old/ })).toBeInTheDocument()
    expect(main.queryByRole('link', { name: /Live/ })).not.toBeInTheDocument()
  })
})

describe('Issues page — rows from the fold', () => {
  it('groups every issue by status with its counts, and filters to mine', () => {
    goTo('/issues')
    render(<App />)
    const main = within(screen.getByRole('main'))
    // Issue 13 is in the archived project, so it is archived with it (FOL-46).
    expect(main.getByRole('tab', { name: /^All/ })).toHaveTextContent('3')
    expect(main.getByRole('tab', { name: /^Open/ })).toHaveTextContent('2')
    expect(main.getByRole('tab', { name: /Assigned to me/ })).toHaveTextContent('1')
    // Issue links only: a row's project chip is a link of its own (S26).
    const issueLinks = () => main.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/issue/'))
    expect(issueLinks()).toHaveLength(3)
    expect(issueLinks().some((a) => a.getAttribute('href')?.includes(D('13')))).toBe(false)
    // The row says the count as a small icon and a number, named in full for a reader who cannot see it (S26).
    expect(main.getByLabelText('1 conversation')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Add issue' })).toBeEnabled()

    fireEvent.click(main.getByRole('tab', { name: /Assigned to me/ }))
    expect(issueLinks()).toHaveLength(1)
    expect(main.getByRole('link', { name: /X-4/ })).toHaveAttribute('href', `/issue/issue-14-${D('14')}`)
  })
})

describe('Project page — one project from the fold', () => {
  it('draws the table with Updated from the last change, the Folder threads, the rail — and offers Delete to a non-author', async () => {
    goTo(`/project/live-${LIVE}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    // Overview (Katerina, 29 September): the title is always editable, with no box.
    expect(await main.findByRole('textbox', { name: 'Title' })).toHaveTextContent('Live')
    // The tabs are in the URL: Issues shows the table, Activity the conversations.
    fireEvent.click(main.getByRole('tab', { name: 'Issues' }))
    await waitFor(() => expect(location.search).toBe('?tab=issues'))
    expect(main.getByRole('table')).toBeInTheDocument()
    expect(main.getAllByRole('row')).toHaveLength(3) // header + 2 issues
    fireEvent.click(main.getByRole('tab', { name: 'Activity' }))
    await waitFor(() => expect(location.search).toBe('?tab=activity'))
    // The record channel's chat waits for the teams read, which tells it from a team's (FOL-2).
    expect(await main.findByText('about the project')).toBeInTheDocument()
    // Replies fold behind the replies button, and it opens them.
    fireEvent.click(main.getByRole('button', { name: /1 reply/ }))
    expect(main.getByText('reply')).toBeInTheDocument()
    expect(main.getByRole('combobox', { name: 'Status' })).toBeEnabled()
    // The Folder it is in, by name — the one whose state lists it — and no pairing (FOL-3).
    expect(main.getByRole('link', { name: 'Ship' })).toHaveAttribute('href', '/app/folder/3167adea-877f-43c4-96fb-517a2b2d5d24')
    expect(main.queryByRole('button', { name: /Folder link|Pair/ })).not.toBeInTheDocument()
    expect(main.getByRole('button', { name: /Archive project/ })).toBeEnabled()
    /*
      Offered even though this viewer did not author the project (SHI-14). The
      relay accepts a deletion from the author *or* from the owner of an
      authoring agent, and ownership lives in `users.agent_owner_pubkey` —
      which no event carries and no route returns, so the page cannot evaluate
      it. Hiding the control guessed the narrower half of the rule and hid it
      from the person most likely to be entitled to it. Archive already works
      this way: offer, and report what the relay says.
    */
    expect(main.getByRole('button', { name: 'Delete project' })).toBeEnabled()
    expect(main.getByText('1 of 2 done')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Add issue' })).toBeEnabled()
  })

  it('asks before deleting, and requests the deletion', async () => {
    vi.mocked(deleteProject).mockResolvedValue({ ok: true })
    goTo(`/project/mine-${MINE}?view=board`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(main.getByRole('button', { name: 'Delete project' }))
    const dialog = within(screen.getByRole('alertdialog', { name: /Delete .Mine./ }))
    expect(deleteProject).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete project' }))
    // The second argument is the Folder read the unlist takes hasState from (FOL-48); writes.test.ts covers it.
    await waitFor(() => expect(vi.mocked(deleteProject).mock.calls[0]?.[0]).toMatchObject({ addr: `30850:x:${MINE}` }))
    expect(await screen.findByText('Project deleted')).toBeInTheDocument()
    await waitFor(() => expect(location.pathname).toBe('/projects'))
  })

  it('asks before archiving, counts the issues it hides, and sends the resolution (FOL-46)', async () => {
    vi.mocked(archiveProject).mockResolvedValue({ ok: true })
    goTo(`/project/live-${LIVE}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    fireEvent.click(main.getByRole('button', { name: 'Archive project' }))
    const dialog = within(screen.getByRole('dialog', { name: /Archive .Live./ }))
    expect(dialog.getByText(/hides the project and its 2 issues from every list/)).toBeInTheDocument()
    expect(archiveProject).not.toHaveBeenCalled()
    fireEvent.change(dialog.getByRole('textbox', { name: /Resolution/ }), { target: { value: 'Shipped in 0.37.' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Archive project' }))
    await waitFor(() => expect(vi.mocked(archiveProject).mock.calls[0]?.slice(1)).toEqual([true, 'Shipped in 0.37.']))
    expect(await screen.findByText('Project archived')).toBeInTheDocument()
  })

  it('an archived project shows who archived it and the resolution first, and restores without asking', async () => {
    vi.mocked(archiveProject).mockResolvedValue({ ok: true })
    const archivedAt = STATE.projects.find((p) => p.id === OLD)!
    vi.mocked(useWorkspace).mockReturnValue({
      state: { ...STATE, activity: [...STATE.activity, { id: 'c'.repeat(64), author: OTHER, createdAt: 1, target: archivedAt.addr, field: 'archived', value: 'true', format: 'marker', note: 'Replaced by Live.' }] },
      error: null, loading: false, busy: false, refresh, live: false,
    })
    goTo(`/project/old-${OLD}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByText(/^Archived by Someone/)).toBeInTheDocument()
    expect(main.getByText('Replaced by Live.')).toBeInTheDocument()
    fireEvent.click(main.getByRole('button', { name: 'Unarchive' }))
    await waitFor(() => expect(vi.mocked(archiveProject).mock.calls[0]?.slice(1)).toEqual([false]))
  })

  it('an issue in an archived project says it is archived with it, and opens the project', async () => {
    goTo(`/issue/issue-13-${D('13')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByText(/^Archived with its project “Old”/)).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Archive issue' })).toBeEnabled()
    fireEvent.click(main.getByRole('button', { name: 'Open project' }))
    await waitFor(() => expect(location.pathname).toMatch(new RegExp(`^/project/old-${OLD}`)))
  })

  it('posts a project conversation into its content Folder and re-reads', async () => {
    vi.mocked(startConversation).mockResolvedValue({ ok: true })
    goTo(`/project/live-${LIVE}?tab=activity`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    // The writing box is an editor now (it loads on first use); what it posts is the same marker text.
    const box = (await main.findByRole('textbox', { name: 'Start a conversation…' })) as HTMLElement & { editor: { commands: { insertContent: (s: string) => void } } }
    act(() => box.editor.commands.insertContent('hello'))
    fireEvent.click(main.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalledWith({ folder: 'f', about: `30850:x:${LIVE}`, withReference: false, body: 'hello', files: [] }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('says so when the project is not in this workspace', () => {
    goTo(`/project/nope-${D('99')}`)
    render(<App />)
    expect(screen.getByText(/not in this workspace/)).toBeInTheDocument()
  })
})

describe('Issue page — one issue from the fold', () => {
  it('draws the trail, the conversation about it, the history in words newest first, and the rail', async () => {
    goTo(`/issue/${D('14')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(await main.findByRole('textbox', { name: 'Title' })).toHaveTextContent('issue 14')
    expect(main.getByText('X-4')).toBeInTheDocument()
    expect(main.queryByRole('link', { name: 'Live' })).not.toBeInTheDocument()
    // Conversations and History are on the Activity tab.
    fireEvent.click(main.getByRole('tab', { name: 'Activity' }))
    await waitFor(() => expect(location.search).toBe('?tab=activity'))
    expect(await main.findByText('hi')).toBeInTheDocument()
    const feed = main.getAllByText(/set (status|assignee) to/)
    expect(feed.map((node) => node.textContent)).toEqual(['Me Myself set status to in_progress', 'Someone set assignee to Me Myself'])
    expect(main.getByRole('combobox', { name: 'Assignee' })).toBeEnabled()
    expect(main.getByRole('button', { name: 'Copy reference for Peek' })).toBeEnabled()
    expect(main.getByText(/Opened by/)).toBeInTheDocument()
  })

  it('a status change is one change event to the issue, then a re-read; a refusal is said and changes nothing', async () => {
    vi.mocked(setIssueField).mockResolvedValue({ ok: true })
    goTo(`/issue/${D('14')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    fireEvent.click(main.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Done' }))
    // The trailing `undefined` is the content format, which only a description
    // carries (RIC-14) — a status is a scalar and says so by passing none.
    await waitFor(() => expect(setIssueField).toHaveBeenCalledWith(expect.objectContaining({ addr: `30851:x:${D('14')}` }), 'status', 'done', 'Status → done', undefined))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    vi.mocked(setIssueField).mockResolvedValue({ ok: false, reason: 'relay said no' })
    fireEvent.click(main.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Cancelled' }))
    expect(await screen.findByText(/Status → cancelled rejected — relay said no/)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(main.getByRole('combobox', { name: 'Status' })).toHaveTextContent('In Progress')
  })

  it('asks before deleting an issue, says the conversations survive, and requests the deletion', async () => {
    vi.mocked(deleteIssue).mockResolvedValue({ ok: true })
    goTo(`/issue/${D('14')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    fireEvent.click(main.getByRole('button', { name: 'Delete issue' }))
    const dialog = within(screen.getByRole('alertdialog', { name: /Delete/ }))
    expect(deleteIssue).not.toHaveBeenCalled()
    // SHI-3 is explicit that this must not read as deleting the discussion.
    expect(dialog.getByText(/not deleted/)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete issue' }))
    await waitFor(() => expect(deleteIssue).toHaveBeenCalledWith(expect.objectContaining({ addr: `30851:x:${D('14')}` })))
    expect(await screen.findByText('Issue deleted')).toBeInTheDocument()
  })

  it('reports a refused deletion and stays on the issue', async () => {
    vi.mocked(deleteIssue).mockResolvedValue({ ok: false, reason: 'must be event author' })
    goTo(`/issue/${D('14')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    fireEvent.click(main.getByRole('button', { name: 'Delete issue' }))
    const dialog = within(screen.getByRole('alertdialog', { name: /Delete/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Delete issue' }))
    expect(await screen.findByText(/Delete rejected — must be event author/)).toBeInTheDocument()
    expect(location.pathname).toBe(`/issue/${D('14')}`)
  })

  it('starts a thread about the issue with the reference Peek needs', async () => {
    vi.mocked(startConversation).mockResolvedValue({ ok: true })
    goTo(`/issue/${D('14')}?tab=activity`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    const box = (await main.findByRole('textbox', { name: 'Start a conversation…' })) as HTMLElement & { editor: { commands: { insertContent: (s: string) => void } } }
    act(() => box.editor.commands.insertContent('seen this?'))
    fireEvent.click(main.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalledWith({ folder: 'f', about: `30851:x:${D('14')}`, withReference: true, body: 'seen this?', files: [] }))
  })

  it('links the project in the trail when the issue has one', () => {
    goTo(`/issue/${D('11')}`)
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Live' })).toHaveAttribute('href', `/project/live-${LIVE}`)
  })

  it('says so when the issue is not in this workspace', () => {
    goTo(`/issue/${D('98')}`)
    render(<App />)
    expect(screen.getByText(/not in this workspace/)).toBeInTheDocument()
  })
})

/**
 * The cold start — reported as "Ship sometimes feels very slow and not loading
 * the projects and issues".
 *
 * `state` is null both while the first read is in flight and when it was
 * refused on quota, and the page rendered nothing for either. A full read takes
 * ~1.1 s against production, so that blank was reachable on every load; when the
 * relay was over budget it stayed.
 */
describe('before the first read lands', () => {
  it('shows a skeleton rather than an empty page', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: null, error: null, loading: true, busy: false, refresh , live: false })
    const { container } = render(<App />)
    expect(container.querySelector('[data-loading="workspace"]')).not.toBeNull()
  })

  /*
    SHI-12 says a quota refusal must not be reported as a broken relay — true
    while a workspace is on screen, and the opposite before one is: the silence
    leaves nothing to distinguish "busy" from "stopped".
  */
  it('says the relay is busy when there is nothing on screen yet', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: null, error: null, loading: false, busy: true, refresh , live: false })
    render(<App />)
    expect(screen.getByText(/The relay is busy/)).toBeInTheDocument()
    // Not the error banner: nothing is broken.
    expect(screen.queryByText(/Could not read from the relay/)).toBeNull()
  })

  it('says nothing about quota once the workspace is on screen', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, loading: false, busy: false, refresh , live: false })
    render(<App />)
    expect(screen.queryByText(/The relay is busy/)).toBeNull()
  })

  /*
    A Folder page does not wait for the workspace (UIG-14 C8): its files are
    read through the projection layer, on their own. So on its route the
    workspace's skeleton is not drawn, and the page is — with its own loading
    rows while its files come — whether the workspace is still loading or the
    relay is busy.
  */
  it('draws a Folder page without waiting for the workspace', () => {
    goTo(`/app/folder/${D('90')}`)
    vi.mocked(useWorkspace).mockReturnValue({ state: null, error: null, loading: true, busy: false, refresh, live: false })
    const { container, unmount } = render(<App />)
    expect(container.querySelector('[data-loading="workspace"]')).toBeNull()
    expect(container.querySelector('[data-loading="folder"]')).not.toBeNull()
    unmount()

    vi.mocked(useWorkspace).mockReturnValue({ state: null, error: null, loading: false, busy: true, refresh, live: false })
    const busy = render(<App />).container
    expect(busy.querySelector('[data-loading="folder"]')).not.toBeNull()
  })
})
