import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryView, FolderState, WorkspaceState } from '@/api'
import { ThreadsContext } from '@/api/useThreads'
import type { Archives } from '@/lib/archive'
import { projectTabs } from '@/lib/projects'
import { ago } from '@/lib/time'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { parse } from '@/router'
import { StatusLabel } from './ui/StatusLabel'

const LEAD = 'b'.repeat(64)
const project = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  addr: `30850:a:${id}`,
  id,
  author: 'a'.repeat(64),
  createdAt: 1,
  title: id,
  description: '',
  descriptionFormat: 'marker',
  contentFolder: 'f',
  status,
  archived: false,
  fields: {},
  ...extra,
})
const issue = (id: string, projectId: string, status: string) => ({ addr: `30851:a:${id}`, id, projectAddr: `30850:a:${projectId}`, status })
const archivesOf = (archived: string[] = []) =>
  ({ ofProject: (addr: string) => (archived.includes(addr) ? { at: 1 } : undefined), ofIssue: (i: { addr: string }) => (archived.includes(i.addr) ? { at: 1 } : undefined) }) as unknown as Archives
const personOf = (pubkey: string) => ({ name: pubkey === LEAD ? 'Ana Duarte' : undefined })
const titles = (rows: { title: string }[]) => rows.map((row) => row.title)

describe('Projects in tabs (SHIPS-7)', () => {
  const projects = [
    project('planned', 'planned'),
    project('started', 'in_progress', { lead: LEAD }),
    project('finished', 'completed'),
    project('dropped', 'cancelled'),
    // Words an older writer left on production: 16 `active`, 6 `done`.
    project('old-active', 'active'),
    project('old-done', 'done'),
    project('gone', 'in_progress'),
  ] as unknown as FolderState['projects']

  it('puts each project on the tab its status means, a cancelled one only under All and an archived one only under Archived', () => {
    const tabs = projectTabs(projects, [], archivesOf(['30850:a:gone']), personOf)
    expect(titles(tabs.planned)).toEqual(['planned'])
    expect(titles(tabs.active)).toEqual(['old-active', 'started'])
    expect(titles(tabs.completed)).toEqual(['finished', 'old-done'])
    expect(titles(tabs.archived)).toEqual(['gone'])
    expect(titles(tabs.all)).toEqual(['dropped', 'finished', 'old-active', 'old-done', 'planned', 'started'])
  })

  it('counts done of all but the cancelled issues, and leaves out an issue archived on its own', () => {
    const issues = [issue('i1', 'started', 'done'), issue('i2', 'started', 'cancelled'), issue('i3', 'started', 'todo'), issue('i4', 'started', 'done')] as unknown as FolderState['issues']
    const [started] = projectTabs([projects[1]], issues, archivesOf(['30851:a:i4']), personOf).active
    expect(started.progress).toEqual({ done: 1, total: 2 })
  })

  it('names the lead, and nobody when the project has none', () => {
    const tabs = projectTabs(projects, [], archivesOf(), personOf)
    expect(tabs.active.find((row) => row.title === 'started')?.lead).toEqual({ name: 'Ana Duarte' })
    expect(tabs.planned[0].lead).toBeUndefined()
  })

  it("names each project's Folder only on the whole workspace's list", () => {
    const folders = [{ id: 'f', name: 'Estiva HQ', addresses: ['30850:a:planned'] }]
    expect(projectTabs(projects, [], archivesOf(), personOf, folders).planned[0].folder).toBe('Estiva HQ')
    expect(projectTabs(projects, [], archivesOf(), personOf).planned[0]).not.toHaveProperty('folder')
  })
})

describe('the Projects page', () => {
  afterEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
  })
  const directory = { nameOf: () => 'Ana', personOf } as unknown as DirectoryView
  const page = (tab: 'active' | 'all' | 'completed', folder?: string, teams: { id: string; name: string; addresses: string[] }[] = []) => {
    const state = {
      projects: [project('Billing', 'in_progress', { lead: LEAD }), project('Docs', 'completed')],
      issues: [issue('i1', 'Billing', 'done'), issue('i2', 'Billing', 'todo'), issue('i3', 'Billing', 'cancelled')],
      conversations: [],
      activity: [],
    } as unknown as WorkspaceState
    return <ProjectsPage key={tab} state={state} directory={directory} teams={teams as never} archives={archivesOf()} tab={tab} folder={folder} say={vi.fn()} refresh={vi.fn()} />
  }
  const tab = (name: RegExp) => screen.getByRole('tab', { name })

  it('opens on the tab asked for with every tab counted, as a table with progress and the lead, and no status column on a one-status tab', () => {
    render(page('active'))
    expect(tab(/^All/).textContent).toContain('2')
    expect(tab(/^Active/).getAttribute('aria-selected')).toBe('true')
    expect(tab(/^Completed/).textContent).toContain('1')
    const row = screen.getByRole('link', { name: 'Billing' }).closest('[data-project]') as HTMLElement
    expect(within(row).getByText('1 / 2')).toBeTruthy()
    expect(within(row).getByRole('img', { name: 'Ana Duarte' })).toBeTruthy()
    expect(screen.queryByText('Status')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Docs' })).toBeNull()
  })

  it('shows the status column on All', () => {
    render(page('all'))
    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
  })

  it('says so in one line on a tab with nothing in it', () => {
    const state = { projects: [], issues: [], conversations: [], activity: [] } as unknown as WorkspaceState
    render(<ProjectsPage state={state} directory={directory} teams={[]} archives={archivesOf()} tab="active" say={vi.fn()} refresh={vi.fn()} />)
    expect(screen.getByText('No active projects.')).toBeTruthy()
  })

  it('keeps a deleted project out of every tab but Archived, where it is under Deleted with Restore (ALO-5)', () => {
    const state = {
      projects: [project('Billing', 'in_progress'), project('Gone', 'in_progress', { deleted: { by: LEAD, at: 1 } })],
      issues: [],
      conversations: [],
      activity: [],
    } as unknown as WorkspaceState
    const { unmount } = render(<ProjectsPage state={state} directory={directory} teams={[]} archives={archivesOf()} tab="active" say={vi.fn()} refresh={vi.fn()} />)
    expect(tab(/^Active/).textContent).toContain('1')
    expect(tab(/^Archived/).textContent).toContain('1')
    expect(screen.queryByRole('link', { name: 'Gone' })).toBeNull()
    unmount()
    render(<ProjectsPage state={state} directory={directory} teams={[]} archives={archivesOf()} tab="archived" say={vi.fn()} refresh={vi.fn()} />)
    expect(screen.getByText('Gone')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Restore/ })).toBeTruthy()
  })

  it("asks for every change of the deleted projects on the Archived tab only, the load holding each one's newest (ALO-5)", () => {
    const state = {
      projects: [project('Billing', 'in_progress'), project('Gone', 'in_progress', { deleted: { by: LEAD, at: 1 } })],
      issues: [],
      conversations: [],
      activity: [],
      threadsAt: {},
      mentionsOf: [],
    } as unknown as WorkspaceState
    const want = vi.fn()
    const at = (tab: 'active' | 'archived') => (
      <ThreadsContext.Provider value={want}>
        <ProjectsPage state={state} directory={directory} teams={[]} archives={archivesOf()} tab={tab} say={vi.fn()} refresh={vi.fn()} />
      </ThreadsContext.Provider>
    )
    const { unmount } = render(at('active'))
    expect(want.mock.calls.flatMap(([wanted]) => wanted.about)).toEqual([])
    unmount()
    render(at('archived'))
    expect(want).toHaveBeenLastCalledWith({ folders: [], about: ['30850:a:Gone'] })
  })

  it('switches to cards and opens on cards next time on this device', () => {
    const { unmount } = render(page('active'))
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
    expect(document.querySelector('[data-surface="projects"]')?.getAttribute('data-view')).toBe('cards')
    unmount()
    render(page('active'))
    expect(document.querySelector('[data-surface="projects"]')?.getAttribute('data-view')).toBe('cards')
    expect(screen.getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('true')
  })

  it("keeps a Folder's Projects in its Folder when a tab is chosen, with no Folder column", () => {
    render(page('active', 'f', [{ id: 'f', name: 'Estiva HQ', addresses: ['30850:a:Billing', '30850:a:Docs'] }]))
    expect(screen.getByRole('heading', { name: 'Estiva HQ · Projects' })).toBeTruthy()
    expect(screen.queryByText('Folder')).toBeNull()
    fireEvent.click(tab(/^Completed/))
    expect(parse(location.pathname + location.search)).toEqual({ name: 'projects', tab: 'completed', folder: 'f' })
  })
})

describe('StatusLabel', () => {
  it('draws a plain circle and the raw word for a status the vocabulary does not know', () => {
    const { container } = render(<StatusLabel value="blocked" label="blocked" />)
    expect(container.querySelector('svg.tabler-icon-circle')).not.toBeNull()
    expect(container.textContent).toBe('blocked')
  })
})

describe('ago', () => {
  const now = 1_700_000_000_000
  it('matches the old app step for step', () => {
    expect(ago(now / 1000 - 5, now)).toBe('just now')
    expect(ago(now / 1000 - 90, now)).toBe('1m ago')
    expect(ago(now / 1000 - 7200, now)).toBe('2h ago')
    expect(ago(now / 1000 - 86400 * 3, now)).toBe('3d ago')
    expect(ago(now / 1000 - 86400 * 30, now)).toMatch(/\d/)
  })
})
