import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentityMenu } from './IdentityMenu'
import { ShipSidebar, type SidebarEntry } from './ShipSidebar'
import type { SidebarTopic } from '@/lib/topics'

const noop = () => {}

/** A 64-hex key. Nothing below may ever print this, or any part of it. */
const KEY = 'a8a7d739'.repeat(8)

describe('ShipSidebar', () => {
  const hrefFor = (entry: SidebarEntry, folder?: string) => (folder ? `/app/folder/${folder}/${entry}` : `/${entry}`)
  const teams = [
    { id: 'peek', name: 'Peek' },
    { id: 'hq', name: 'Estiva HQ' },
  ]
  const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
  const rowsOf = (container: HTMLElement, id: string) => [...container.querySelectorAll(`[data-nav-group="${id}"] a`)]

  afterEach(() => window.localStorage.clear())

  it('reads Projects, Issues, then Explore topics where the top Topics was, with the counts on Projects and Issues only (TOPI-9)', () => {
    render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={18} activeProjects={5} hrefFor={hrefFor} current={{ entry: 'topics' }} />)
    expect(links()).toEqual([['Projects5', '/projects'], ['Issues18', '/issues'], ['Explore topics', '/topics']])
    expect(screen.getByRole('link', { name: /^Projects/ })).toHaveTextContent('5')
    expect(screen.getByRole('link', { name: 'Explore topics' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('You are in no topic yet.')).toBeInTheDocument()
    expect(screen.queryByText(/^Home$|^Views$|^Starred$/)).not.toBeInTheDocument()
  })

  const topic = (n: number, work: SidebarTopic['work'] = []): SidebarTopic => ({ id: `30840:p:t${n}`, title: `Topic ${n}`, href: `/topic/t${n}`, work })

  it('draws your topics in the order given, each folding to its projects then issues, then Explore topics with no icon', async () => {
    const work: SidebarTopic['work'] = [
      { id: '30850:p:launch', kind: 'project', title: 'Launch', href: '/project/launch' },
      { id: '30851:p:fix', kind: 'issue', title: 'Fix login', href: '/issue/fix' },
    ]
    render(<ShipSidebar topics={[topic(2, work), topic(1)]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} />)
    expect(links().map(([text]) => text)).toEqual(['Projects', 'Issues', 'Topic 2', 'Topic 1', 'Explore topics'])
    await userEvent.click(screen.getByRole('button', { name: /Topic 2/ }))
    expect(links().map(([text, to]) => `${text} ${to}`)).toEqual([
      'Projects /projects',
      'Issues /issues',
      'Topic 2 /topic/t2',
      'Launch /project/launch',
      'Fix login /issue/fix',
      'Topic 1 /topic/t1',
      'Explore topics /topics',
    ])
    expect(screen.getByRole('link', { name: 'Explore topics' }).querySelector('svg')).toBeNull()
  })

  it('on a project a topic lists, that topic opens and the project is marked under it', () => {
    const work: SidebarTopic['work'] = [{ id: '30850:p:launch', kind: 'project', title: 'Launch', href: '/project/launch' }]
    render(<ShipSidebar topics={[topic(1, work)]} openFile="30850:p:launch" onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} />)
    expect(screen.getByRole('link', { name: 'Launch' })).toHaveAttribute('aria-current', 'page')
  })

  it("on a topic's page its row is marked, not Explore topics", () => {
    render(<ShipSidebar topics={[topic(1)]} openTopic="30840:p:t1" onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} />)
    expect(screen.getByRole('link', { name: 'Topic 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Explore topics' })).not.toHaveAttribute('aria-current')
  })

  it("says the topics didn't load, with Try again, and still offers Explore topics", async () => {
    const onRetryTopics = vi.fn()
    render(<ShipSidebar topics="failed" onRetryTopics={onRetryTopics} openIssues={0} activeProjects={0} hrefFor={hrefFor} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryTopics).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Explore topics' })).toBeInTheDocument()
  })

  it("folds each team, alphabetically and closed, to its own Topics, Projects and Issues, with no count and no catch-all fold", async () => {
    const { container } = render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={3} activeProjects={2} hrefFor={hrefFor} folders={teams} current={{ entry: 'topics' }} />)
    expect(screen.getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-expanded')])).toEqual([
      ['Estiva HQ', 'false'],
      ['Peek', 'false'],
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Estiva HQ' }))
    expect(rowsOf(container, 'hq').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Topics', '/app/folder/hq/topics'],
      ['Projects', '/app/folder/hq/projects'],
      ['Issues', '/app/folder/hq/issues'],
    ])
    expect(screen.queryByRole('button', { name: 'Not in a Folder' })).not.toBeInTheDocument()
  })

  it("on a project, its team's fold opens and that team's Projects is marked, not the top one, though the fold was closed by hand", () => {
    window.localStorage.setItem('ship.sidebar.folder.peek', 'closed')
    const { container } = render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={1} hrefFor={hrefFor} folders={teams} current={{ entry: 'projects', folder: 'peek' }} />)
    expect(screen.getByRole('button', { name: 'Peek' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Estiva HQ' })).toHaveAttribute('aria-expanded', 'false')
    const marked = [...container.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href'))
    expect(marked).toEqual(['/app/folder/peek/projects'])
  })

  it("on an issue in no team, the top Issues is marked and no fold opens", () => {
    render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={1} activeProjects={0} hrefFor={hrefFor} folders={teams} current={{ entry: 'issues' }} />)
    expect(screen.getByRole('link', { name: /^Issues/ })).toHaveAttribute('aria-current', 'page')
    for (const fold of screen.getAllByRole('button')) expect(fold).toHaveAttribute('aria-expanded', 'false')
  })

  it('marks nothing on the Folder page, or on another app’s file', () => {
    const { rerender } = render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} folders={teams} current={{ folderId: 'peek' }} />)
    expect(document.querySelector('[aria-current]')).toBeNull()
    rerender(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} folders={teams} />)
    expect(document.querySelector('[aria-current]')).toBeNull()
  })

  it("the arrow on a team's fold opens the Folder", async () => {
    const onOpenFolder = vi.fn()
    render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} folders={teams} onOpenFolder={onOpenFolder} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Open team' })[1]!)
    expect(onOpenFolder).toHaveBeenCalledWith(teams[0])
  })

  it('falls back to the id when a team has no name', () => {
    // A state written by a placement carries no name, and `listFolders` reads
    // the state's name and stops (the Peek team, 2026-09-15).
    render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} folders={[{ id: 'f1' }]} />)
    expect(screen.getByRole('button', { name: 'f1' })).toBeInTheDocument()
  })

  it('draws no counts while the workspace is coming, and placeholder rows while the Folders are', () => {
    const { container } = render(<ShipSidebar topics={[]} onRetryTopics={noop} openIssues={0} activeProjects={0} hrefFor={hrefFor} loading folders={[]} foldersLoading />)
    // A zero would be a claim (SHI-20).
    expect(links().map(([text]) => text)).toEqual(['Projects', 'Issues', 'Explore topics'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"].animate-skeleton-in')).toHaveLength(1)
  })
})

describe('IdentityMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Anonymous with a silhouette, and the old menu text, with no key anywhere', () => {
    const onCopyKey = vi.fn()
    const { container } = render(
      <IdentityMenu me={{}} signedIn={false} relayUrl="http://localhost:3000" onCopyKey={onCopyKey} />,
    )
    const trigger = screen.getByRole('button', { name: /Anonymous/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Acting as')).toBeInTheDocument()
    expect(screen.getByText('A key held by this browser only. Nobody else knows who you are.')).toBeInTheDocument()
    expect(screen.getByText('Everyone on this relay shares this workspace, in every app.')).toBeInTheDocument()
    expect(screen.getByText('http://localhost:3000')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}/)
    // Anonymous, in a build with no Estiva ID: the one action is copying the key.
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy public key' }))
    expect(onCopyKey).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(container.textContent).not.toContain(KEY.slice(0, 8))
  })

  it('offers the Estiva ID link and Sign out only when signed in to a build that has ID', () => {
    const onSignOut = vi.fn()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(
      <IdentityMenu
        me={{ name: 'Ana Duarte' }}
        signedIn
        idBase="https://id.estiva.app"
        relayUrl="http://localhost:3000"
        onCopyKey={vi.fn()}
        onSignOut={onSignOut}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ana Duarte/ }))
    expect(screen.getByText('Signed in as')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit your profile in Estiva ID' }))
    expect(open).toHaveBeenCalledWith('https://id.estiva.app', '_blank', 'noopener,noreferrer')
    fireEvent.click(screen.getByRole('button', { name: /Ana Duarte/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on a click outside', () => {
    render(<IdentityMenu me={{}} signedIn={false} relayUrl="http://localhost:3000" onCopyKey={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /Anonymous/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
