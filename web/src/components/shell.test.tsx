import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, initialsFromName } from './ui/Avatar'
import { IdentityMenu } from './IdentityMenu'
import { NavItem } from './NavItem'
import { Sidebar } from './Sidebar'

/** A 64-hex key. Nothing below may ever print this, or any part of it. */
const KEY = 'a8a7d739'.repeat(8)

describe('Avatar', () => {
  it('takes initials from a name, never from a key', () => {
    expect(initialsFromName('Jan Mikula')).toBe('JM')
    expect(initialsFromName('Katerina')).toBe('KA')
    expect(initialsFromName(undefined)).toBe('')
    expect(initialsFromName('   ')).toBe('')
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
    expect(labels).toEqual(['Issues5', 'Projects', 'One2', 'Two'])
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
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')
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
        me={{ name: 'Jan Mikula' }}
        signedIn
        idBase="https://id.estiva.app"
        relayUrl="http://localhost:3000"
        onCopyKey={vi.fn()}
        onSignOut={onSignOut}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Jan Mikula/ }))
    expect(screen.getByText('Signed in as')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit your profile in Estiva ID' }))
    expect(open).toHaveBeenCalledWith('https://id.estiva.app', '_blank', 'noopener,noreferrer')
    fireEvent.click(screen.getByRole('button', { name: /Jan Mikula/ }))
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
