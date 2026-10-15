import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentityMenu } from './IdentityMenu'
import { ShipSidebar } from './ShipSidebar'

/** A 64-hex key. Nothing below may ever print this, or any part of it. */
const KEY = 'a8a7d739'.repeat(8)

describe('ShipSidebar', () => {
  const projects = [
    { addr: '30850:x:one', title: 'One', href: '#/p/one', openCount: 2 },
    { addr: '30850:x:two', title: 'Two', href: '#/p/two', openCount: 0 },
  ]

  it('lists Issues, Projects, then the active projects', () => {
    render(
      <ShipSidebar openIssues={5} issuesHref="#/" projectsHref="#/projects" projects={projects} current="issues" />,
    )
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Issues5', 'Projects2', 'One2', 'Two'])
  })

  it('marks a project route on its own row, keyed by addr', () => {
    render(
      <ShipSidebar
        openIssues={5}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={projects}
        current={{ projectAddr: '30850:x:two' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Two' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^Projects/ })).not.toHaveAttribute('aria-current')
  })

  const teams = [
    { id: 'peek', name: 'Peek' },
    { id: 'hq', name: 'Estiva HQ' },
  ]
  const filed = [
    { ...projects[0]!, folder: 'peek' },
    { ...projects[1]!, folder: 'hq' },
  ]

  it('folds the projects under their teams, alphabetically, and draws no Projects fold (SHI-25)', () => {
    render(
      <ShipSidebar openIssues={5} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={teams} current="issues" />,
    )
    const folds = screen.getAllByRole('button').map((b) => b.textContent)
    expect(folds).toEqual(['Estiva HQ', 'Peek'])
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Issues5', 'Projects2', 'Two', 'One2'])
    // The team is a fold, not a link: a team's row carries no count and no href.
    expect(screen.queryByRole('link', { name: 'Peek' })).not.toBeInTheDocument()
  })

  it("a team's rows are what its state lists, not each project's own Folder (FOL-5)", () => {
    // One is filed by `contentFolder` under Peek, but Estiva HQ's state lists
    // it — which is what Peek's Folders column draws, so Ship draws it there.
    const listed = [
      { id: 'peek', name: 'Peek', addresses: ['30850:x:two'] },
      { id: 'hq', name: 'Estiva HQ', addresses: ['30850:x:one', '39000:relay:some-topic'] },
    ]
    const { container } = render(
      <ShipSidebar openIssues={5} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={listed} current="issues" />,
    )
    const rowsOf = (id: string) =>
      [...container.querySelectorAll(`[data-nav-group="${id}"] a`)].map((a) => a.textContent)
    expect(rowsOf('hq')).toEqual(['One2'])
    expect(rowsOf('peek')).toEqual(['Two'])
    expect(screen.queryByRole('button', { name: 'Not in a Folder' })).not.toBeInTheDocument()
  })

  it('a project no state lists falls back to its own Folder when that is a team', () => {
    // Created a moment ago: its record names the team, and the listing has not
    // been read again since the team's state gained it.
    const listed = [
      { id: 'peek', name: 'Peek', addresses: [] },
      { id: 'hq', name: 'Estiva HQ', addresses: ['30850:x:two'] },
    ]
    const { container } = render(
      <ShipSidebar openIssues={5} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={listed} current="issues" />,
    )
    expect([...container.querySelectorAll('[data-nav-group="peek"] a')].map((a) => a.textContent)).toEqual(['One2'])
  })

  it('a project in no Folder is under "Not in a Folder", not a fold named like one', () => {
    render(
      <ShipSidebar
        openIssues={5}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={[filed[0]!, projects[1]!, { addr: '30850:x:three', title: 'Three', href: '#/p/three', openCount: 1, folder: 'not-a-team' }]}
        folders={teams}
        current="issues"
      />,
    )
    const folds = screen.getAllByRole('button').map((b) => b.textContent)
    expect(folds).toEqual(['Estiva HQ', 'Peek', 'Not in a Folder'])
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Issues5', 'Projects3', 'One2', 'Two', 'Three1'])
  })

  it('a project row\'s menu offers "Move to Folder…" for that project, and only when asked for (FOL-7)', async () => {
    const onMoveProject = vi.fn()
    const { rerender } = render(
      <ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={teams} current="issues" onMoveProject={onMoveProject} />,
    )
    // The rows are still links, and the menu is beside the link, not inside it.
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Issues', 'Projects2', 'Two', 'One2'])
    await userEvent.click(screen.getByRole('button', { name: 'More options for One' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to Folder…' }))
    expect(onMoveProject).toHaveBeenCalledWith(filed[0])
    rerender(<ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={teams} current="issues" />)
    expect(screen.queryByRole('button', { name: /More options/ })).not.toBeInTheDocument()
  })

  it("the arrow on a team's fold opens the Folder", async () => {
    const onOpenFolder = vi.fn()
    render(
      <ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={teams} current="issues" onOpenFolder={onOpenFolder} />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Open folder' })[1]!)
    expect(onOpenFolder).toHaveBeenCalledWith(teams[0])
  })

  it('falls back to the id when a team has no name', () => {
    // A state written by a placement carries no name, and `listFolders` reads
    // the state's name and stops (the Peek team, 2026-09-15).
    render(
      <ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} folders={[{ id: 'f1' }]} current="issues" />,
    )
    expect(screen.getByRole('button', { name: 'f1' })).toBeInTheDocument()
  })

  it('marks a project route on its row and nothing on a folder route', () => {
    render(
      <ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={filed} folders={teams} current={{ folderId: 'peek' }} />,
    )
    // Both branches of `current` are objects; a folder route must not light a
    // project row, which is why the discriminant is a key check, not `typeof`.
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current')
  })

  it('shows placeholder rows while either read is still coming, and no team yet', () => {
    const { container } = render(<ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} current="issues" loading folders={[]} foldersLoading />)
    // No heading over the placeholder: it used to be "Projects", the catch-all's title (FOL-5).
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"].animate-skeleton-in')).toHaveLength(1)
    const { container: withProjects } = render(
      <ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={filed} current="issues" folders={[]} foldersLoading />,
    )
    // The projects are known and the teams are not: still the placeholder,
    // rather than a flat list that regroups itself a moment later.
    expect(withProjects.querySelectorAll('[aria-hidden="true"].animate-skeleton-in')).toHaveLength(1)
    expect(withProjects.querySelector('[data-nav-group]')).toBeNull()
  })

  it('draws no team fold when there are none', () => {
    render(<ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} current="issues" />)
    expect(document.querySelector('[data-nav-group]')).toBeNull()
  })

  it('draws no Projects heading when there are none', () => {
    render(<ShipSidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} current="projects" />)
    expect(screen.getAllByRole('link')).toHaveLength(2)
    // Only the nav entry says "Projects"; the section heading is not drawn.
    expect(screen.getAllByText('Projects')).toHaveLength(1)
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
