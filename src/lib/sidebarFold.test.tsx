import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from '@/components/AppShell'
import { useSidebarFold } from './sidebarFold'

function Shell() {
  const [open, setOpen] = useSidebarFold()
  return (
    <AppShell logo="Estiva Ship" navOpen={open} onNavOpenChange={setOpen} nav={<nav aria-label="Projects">Projects</nav>}>
      <p>Page</p>
    </AppShell>
  )
}

/** SHI-54: the sidebar folds from the top bar's button, and stays folded after a reload, as Leaf's does. */
describe('useSidebarFold', () => {
  afterEach(() => window.localStorage.clear())

  it('keeps the sidebar folded after a reload, until it is shown again', async () => {
    const first = render(<Shell />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide the sidebar' }))
    first.unmount()

    const reloaded = render(<Shell />)
    expect(screen.getByRole('button', { name: 'Show the sidebar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show the sidebar' }))
    reloaded.unmount()

    render(<Shell />)
    expect(screen.getByRole('button', { name: 'Hide the sidebar' })).toBeInTheDocument()
  })
})

/** Katerina, 30 October: a file opened from a link shows where it lives, so a folded sidebar unfolds for it. */
describe('useSidebarFold and a file opened from a link', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
  })
  const arrive = (path: string, how: 'navigate' | 'reload') => {
    window.localStorage.setItem('ship.sidebarFolded', '1')
    window.history.replaceState(null, '', path)
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: how }] as unknown as PerformanceEntryList)
  }

  it('unfolds for an issue opened from a link, and stays unfolded on this browser', () => {
    arrive('/issue/fix-the-login-6f1c2b9e-0000-4000-8000-000000000001', 'navigate')
    render(<Shell />)
    expect(screen.getByRole('button', { name: 'Hide the sidebar' })).toBeInTheDocument()
    expect(window.localStorage.getItem('ship.sidebarFolded')).toBeNull()
  })

  it('stays folded on a reload of the issue, and on the Issues list', () => {
    arrive('/issue/fix-the-login-6f1c2b9e-0000-4000-8000-000000000001', 'reload')
    const reloaded = render(<Shell />)
    expect(screen.getByRole('button', { name: 'Show the sidebar' })).toBeInTheDocument()
    reloaded.unmount()
    arrive('/', 'navigate')
    render(<Shell />)
    expect(screen.getByRole('button', { name: 'Show the sidebar' })).toBeInTheDocument()
  })
})
