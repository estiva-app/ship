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
import App, { sidebarProps } from './App'

const project = (addr: string, title: string, archived = false) => ({
  addr, id: addr, author: OTHER, createdAt: 1, title, description: '', contentFolder: 'f', originFolder: 'f', status: 'planned', archived, fields: {},
})
const issue = (addr: string, projectAddr: string | undefined, status: string) => ({
  addr, id: addr, author: OTHER, createdAt: 1, title: addr, description: '', folder: 'f', projectAddr, status, fields: {},
})

const STATE: FolderState = {
  projects: [project('30850:x:live', 'Live'), project('30850:x:old', 'Old', true)],
  issues: [
    issue('30851:x:1', '30850:x:live', 'todo'),
    issue('30851:x:2', '30850:x:live', 'done'),
    issue('30851:x:3', '30850:x:old', 'todo'),
    issue('30851:x:4', undefined, 'in_progress'),
  ],
  activity: [],
  conversations: [],
}

beforeEach(() => {
  location.hash = ''
  vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: null, refresh: async () => {} })
  vi.mocked(useDirectory).mockReturnValue({
    directory: new Map(),
    nameOf: (k: string) => (k === ME ? 'Me Myself' : 'Someone'),
    personOf: () => ({}),
    profileOf: () => undefined,
  })
  vi.mocked(resolveInbound).mockReset()
})

describe('sidebarProps — the old app\'s counting rules', () => {
  it('counts open issues outside archived projects, and open issues per active project', () => {
    const props = sidebarProps(STATE, { name: 'issues' })
    // 1 (todo, live) + 4 (in_progress, no project); 2 is done, 3 is in an archived project.
    expect(props.openIssues).toBe(2)
    expect(props.projects.map((p) => [p.title, p.openCount])).toEqual([['Live', 1]])
    expect(props.current).toBe('issues')
  })

  it('marks the open project as current', () => {
    expect(sidebarProps(STATE, { name: 'project', addr: '30850:x:live', view: 'table' }).current).toEqual({ projectAddr: '30850:x:live' })
  })
})

describe('App — the shell around the route', () => {
  it('shows the viewer by name, the counts from the relay, and canonicalises an empty hash', async () => {
    render(<App />)
    expect(screen.getByText('Me Myself')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Issues/ })).toHaveTextContent('2')
    await waitFor(() => expect(location.hash).toBe('#/issues'))
  })

  it('shows the read error as a banner and keeps the shell', () => {
    vi.mocked(useWorkspace).mockReturnValue({ state: STATE, error: 'relay refused', refresh: async () => {} })
    render(<App />)
    expect(screen.getByText(/Could not read from the relay — relay refused/)).toBeInTheDocument()
    expect(screen.getByText('Me Myself')).toBeInTheDocument()
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
