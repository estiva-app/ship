import { afterEach, describe, expect, it } from 'vitest'
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
