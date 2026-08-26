import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderState } from '@/api'

const { ME, OTHER } = vi.hoisted(() => ({ ME: 'e'.repeat(64), OTHER: 'f'.repeat(64) }))

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    me: ME,
    useWorkspace: vi.fn(),
    useDirectory: vi.fn(),
    resolveInbound: vi.fn(),
  }
})

import { resolveInbound, useDirectory, useWorkspace } from '@/api'
import { fireEvent } from '@testing-library/react'
import App, { sidebarProps } from './App'

const project = (addr: string, title: string, archived = false) => ({
  addr, id: addr, author: OTHER, createdAt: 1, title, description: '', contentFolder: 'f', originFolder: 'f', status: 'planned', archived, fields: {},
})
const issue = (addr: string, projectAddr: string | undefined, status: string) => ({
  addr, id: addr, author: OTHER, createdAt: 1, title: addr, description: '', folder: 'f', projectAddr, status, fields: {},
})

const STATE: FolderState = {
  projects: [project('30850:x:live', 'Live'), project('30850:x:old', 'Old', true), { ...project('30850:x:mine', 'Mine'), author: ME, lead: OTHER }],
  issues: [
    issue('30851:x:1', '30850:x:live', 'todo'),
    issue('30851:x:2', '30850:x:live', 'done'),
    issue('30851:x:3', '30850:x:old', 'todo'),
    { ...issue('30851:x:4', undefined, 'in_progress'), assignee: ME, ref: 'X-4' },
  ],
  activity: [
    { id: 'ch1', author: OTHER, createdAt: 99, target: '30851:x:1', field: 'status', value: 'todo', note: '' },
    { id: 'ch2', author: OTHER, createdAt: 100, target: '30851:x:4', field: 'assignee', value: ME, note: '' },
    { id: 'ch3', author: ME, createdAt: 101, target: '30851:x:4', field: 'status', value: 'in_progress', note: '' },
  ],
  conversations: [
    { id: 'c1', root: { id: 'c1', author: OTHER, createdAt: 5, body: 'hi nostr:naddr1qqxyz', folder: 'f', about: ['30851:x:4'] }, replies: [], about: ['30851:x:4'], createdAt: 5, lastAt: 5 },
    { id: 'c2', root: { id: 'c2', author: ME, createdAt: 6, body: 'about the project', folder: 'f', about: [] }, replies: [{ id: 'c3', author: OTHER, createdAt: 7, body: 'reply', folder: 'f', about: [] }], about: [], createdAt: 6, lastAt: 7 },
  ],
}

beforeEach(() => {
  location.hash = ''
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, refresh: async () => {} })
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
    expect(sidebarProps(STATE, { name: 'project', addr: '30850:x:live', view: 'table' }).current).toEqual({ projectAddr: '30850:x:live' })
  })
})

describe('App — the shell around the route', () => {
  it('shows the viewer by name, the counts from the relay, and canonicalises an empty hash', async () => {
    render(<App />)
    expect(within(screen.getByRole('banner')).getByText('Me Myself')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Issues/ })).toHaveTextContent('2')
    await waitFor(() => expect(location.hash).toBe('#/issues'))
  })

  it('shows the read error as a banner and keeps the shell', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: 'relay refused', refresh: async () => {} })
    render(<App />)
    expect(screen.getByText(/Could not read from the relay — relay refused/)).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Me Myself')).toBeInTheDocument()
  })

  it('lands an inbound reference on the object it names', async () => {
    vi.mocked(resolveInbound).mockResolvedValue({ addr: '30851:x:1', kind: 'issue' })
    location.hash = '#/o/naddr1abc'
    render(<App />)
    await waitFor(() => expect(location.hash).toBe('#/issue/30851%3Ax%3A1'))
    expect(resolveInbound).toHaveBeenCalledWith('naddr1abc')
  })

  it('falls back to the issue list, with a reason, when the reference cannot be resolved', async () => {
    vi.mocked(resolveInbound).mockResolvedValue(null)
    location.hash = '#/o/naddr1unknown'
    render(<App />)
    await waitFor(() => expect(location.hash).toBe('#/issues'))
    expect(screen.getByText(/Could not resolve that reference/)).toBeInTheDocument()
  })
})

describe('Projects page — cards from the fold', () => {
  it('draws the active projects with their counts, and the archived one behind the tab', () => {
    location.hash = '#/projects'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(main.getByRole('link', { name: /Live/ })).toHaveTextContent('2 issues')
    expect(main.queryByRole('link', { name: /Old/ })).not.toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Add project' })).toBeDisabled()
  })

  it('shows the archived list when the route asks for it', () => {
    location.hash = '#/projects?archived'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: /Old/ })).toBeInTheDocument()
    expect(main.queryByRole('link', { name: /Live/ })).not.toBeInTheDocument()
  })
})

describe('Issues page — rows from the fold', () => {
  it('groups every issue by status with its counts, and filters to mine', () => {
    location.hash = '#/issues'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('tab', { name: /^All/ })).toHaveTextContent('4')
    expect(main.getByRole('tab', { name: /^Open/ })).toHaveTextContent('3')
    expect(main.getByRole('tab', { name: /Assigned to me/ })).toHaveTextContent('1')
    expect(main.getAllByRole('link')).toHaveLength(4)
    expect(main.getByRole('link', { name: /X-4/ })).toHaveTextContent('1 conversation')
    expect(main.getByRole('button', { name: 'Add issue' })).toBeDisabled()

    fireEvent.click(main.getByRole('tab', { name: /Assigned to me/ }))
    expect(main.getAllByRole('link')).toHaveLength(1)
    expect(main.getByRole('link', { name: /X-4/ })).toHaveAttribute('href', '#/issue/30851%3Ax%3A4')
  })
})

describe('Project page — one project from the fold', () => {
  it('draws the table with Updated from the last change, the Folder threads, the rail — and no Delete for a non-author', () => {
    location.hash = '#/project/30850%3Ax%3Alive'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByLabelText('Title')).toHaveTextContent('Live')
    expect(main.getByRole('table')).toBeInTheDocument()
    expect(main.getAllByRole('row')).toHaveLength(3) // header + 2 issues
    expect(main.getByText('about the project')).toBeInTheDocument()
    expect(main.getByText('reply')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Status' })).toBeDisabled()
    expect(main.getByRole('button', { name: 'Copy Folder link' })).toBeEnabled()
    expect(main.getByRole('button', { name: /Archive project/ })).toBeDisabled()
    expect(main.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument()
    expect(main.getByText('1 of 2 done')).toBeInTheDocument()
    expect(main.queryByRole('button', { name: /Edit title/ })).not.toBeInTheDocument()
  })

  it('offers Delete (disabled, with its reason) to the author, and the board when the route says so', () => {
    location.hash = '#/project/30850%3Ax%3Amine?view=board'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('button', { name: 'Delete project' })).toBeDisabled()
    expect(main.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says so when the project is not in this workspace', () => {
    location.hash = '#/project/30850%3Ax%3Anope'
    render(<App />)
    expect(screen.getByText(/not in this workspace/)).toBeInTheDocument()
  })
})

describe('Issue page — one issue from the fold', () => {
  it('draws the trail, the conversation about it, the history in words newest first, and the rail', () => {
    location.hash = '#/issue/30851%3Ax%3A4'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByLabelText('Title')).toHaveTextContent('30851:x:4')
    expect(main.getByText('X-4')).toBeInTheDocument()
    expect(main.queryByRole('link', { name: 'Live' })).not.toBeInTheDocument()
    expect(main.getByText('hi')).toBeInTheDocument()
    const feed = main.getAllByText(/set (status|assignee) to/)
    expect(feed.map((node) => node.textContent)).toEqual(['Me Myself set status to in_progress', 'Someone set assignee to Me Myself'])
    expect(main.getByRole('button', { name: 'Assignee' })).toBeDisabled()
    expect(main.getByRole('button', { name: 'Copy reference for Peek' })).toBeEnabled()
    expect(main.getByText(/Opened by/)).toBeInTheDocument()
  })

  it('links the project in the trail when the issue has one', () => {
    location.hash = '#/issue/30851%3Ax%3A1'
    render(<App />)
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Live' })).toHaveAttribute('href', '#/project/30850%3Ax%3Alive')
  })

  it('says so when the issue is not in this workspace', () => {
    location.hash = '#/issue/30851%3Ax%3Anope'
    render(<App />)
    expect(screen.getByText(/not in this workspace/)).toBeInTheDocument()
  })
})
