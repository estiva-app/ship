import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialsFor } from '@estiva-app/ui'
import { Avatar } from './ui/Avatar'
import { IdentityMenu } from './IdentityMenu'
import { NavItem } from './NavItem'
import { Sidebar } from './Sidebar'

/** A 64-hex key. Nothing below may ever print this, or any part of it. */
const KEY = 'a8a7d739'.repeat(8)

describe("Avatar (the shared one, on Peek's rules)", () => {
  it('takes initials from a name — the first letter of the first two words', () => {
    expect(initialsFor('Ana Duarte')).toBe('AD')
    expect(initialsFor('Ravi')).toBe('R')
    expect(initialsFor('Mara Sato Ito')).toBe('MS')
  })

  it('draws the initials when named, and never a key', () => {
    const { container } = render(<Avatar name="Ana Duarte" />)
    expect(container.textContent).toBe('AD')
    expect(container.textContent).not.toContain(KEY.slice(0, 4))
  })

  it('draws a silhouette when there is no name', () => {
    const { container } = render(<Avatar />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toBe('')
  })
})

describe('NavItem', () => {
  it('counts open issues and says so', () => {
    render(<NavItem label="Issues" href="#/" count={18} />)
    expect(screen.getByText('18')).toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByText('18').parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('18 open')
  })

  it('draws no counter for zero', () => {
    const { container } = render(<NavItem label="Projects" href="#/projects" count={0} />)
    expect(container.textContent).toBe('Projects')
  })

  it('marks the active entry for assistive tech', () => {
    render(<NavItem label="Issues" href="#/" active />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  })
})

describe('Sidebar', () => {
  const projects = [
    { addr: '30850:x:one', title: 'One', href: '#/p/one', openCount: 2 },
    { addr: '30850:x:two', title: 'Two', href: '#/p/two', openCount: 0 },
  ]

  it('lists Issues, Projects, then the active projects', () => {
    render(
      <Sidebar openIssues={5} issuesHref="#/" projectsHref="#/projects" projects={projects} current="issues" />,
    )
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Issues5', 'Projects2', 'One2', 'Two'])
  })

  it('marks a project route on its own row, keyed by addr', () => {
    render(
      <Sidebar
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

  it('lists Folders in their own section, under the projects', () => {
    render(
      <Sidebar
        openIssues={5}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={projects}
        folders={[{ id: 'f1', name: 'Onboarding', href: '#/folder/f1' }]}
        current="issues"
      />,
    )
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Issues5', 'Projects2', 'One2', 'Two', 'Onboarding'])
  })

  it('a folder row carries no count', () => {
    // Deliberate: a Folder holds files from apps Ship does not own, so any
    // number here would be Ship's records only — a lie about a container that
    // holds a topic — and RFC 0.4 §4.2 makes the count a disclosure of its own.
    render(
      <Sidebar
        openIssues={0}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={[]}
        folders={[{ id: 'f1', name: 'Onboarding', href: '#/folder/f1' }]}
        current="issues"
      />,
    )
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveTextContent(/^Onboarding$/)
  })

  it('falls back to the id when a folder has no name', () => {
    // A Folder with no state event has only its channel's name, and a channel
    // created by an app rather than a person may have none at all.
    render(
      <Sidebar
        openIssues={0}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={[]}
        folders={[{ id: 'f1', href: '#/folder/f1' }]}
        current="issues"
      />,
    )
    expect(screen.getByRole('link', { name: 'f1' })).toBeInTheDocument()
  })

  it('marks a folder route on its own row', () => {
    render(
      <Sidebar
        openIssues={0}
        issuesHref="#/"
        projectsHref="#/projects"
        projects={projects}
        folders={[{ id: 'f1', name: 'Onboarding', href: '#/folder/f1' }]}
        current={{ folderId: 'f1' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveAttribute('aria-current', 'page')
    // The project rows must not light up for a folder route — both branches of
    // `current` are objects, and telling them apart is the whole reason the
    // discriminant moved from `typeof` to a key check.
    expect(screen.getByRole('link', { name: /^One/ })).not.toHaveAttribute('aria-current')
  })

  it('draws no Folders heading when there are none', () => {
    render(<Sidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} current="issues" />)
    expect(screen.queryByText('Folders')).not.toBeInTheDocument()
  })

  it('draws no Projects heading when there are none', () => {
    render(<Sidebar openIssues={0} issuesHref="#/" projectsHref="#/projects" projects={[]} current="projects" />)
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
