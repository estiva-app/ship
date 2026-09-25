import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ago } from '@/lib/time'
import { StatusLabel } from './ui/StatusLabel'
import { ProjectCard } from './ProjectCard'

const base = {
  href: '#/p/x',
  title: 'A project',
  status: { value: 'in_progress', label: 'In Progress' },
  issueCount: 4,
  doneCount: 1,
  author: { name: 'Ana Duarte' },
  createdAt: Math.floor(Date.now() / 1000) - 86400,
}

describe('ProjectCard', () => {
  it('reads status · N issues · x/y done · by name · ago', () => {
    const { container } = render(<ProjectCard {...base} description="Two lines at most." />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '#/p/x')
    expect(container.textContent).toContain('In Progress·4 issues·1/4 done')
    // The face's initials sit in textContent between "by" and the name.
    expect(container.textContent).toContain('Ana Duarte·1d ago')
    expect(container.textContent).not.toContain('Archived')
  })

  it('draws no counters for a project with no issues', () => {
    const { container } = render(<ProjectCard {...base} issueCount={0} doneCount={0} />)
    expect(container.textContent).not.toContain('issue')
    expect(container.textContent).not.toContain('/')
  })

  it('says one issue, not one issues', () => {
    const { container } = render(<ProjectCard {...base} issueCount={1} doneCount={0} />)
    expect(container.textContent).toContain('1 issue·0/1 done')
  })

  it('carries the Archived chip when archived', () => {
    render(<ProjectCard {...base} archived />)
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('names an unknown author with an em dash, never a key', () => {
    const { container } = render(<ProjectCard {...base} author={{}} />)
    expect(container.textContent).toContain('by—')
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}/)
  })
})

describe('StatusLabel', () => {
  it('draws a plain circle and the raw word for a status the vocabulary does not know', () => {
    const { container } = render(<StatusLabel value="blocked" label="blocked" />)
    expect(container.querySelector('svg.tabler-icon-circle')).not.toBeNull()
    expect(container.textContent).toBe('blocked')
  })

  it('shares shapes between issues and projects, and one colour across sizes', () => {
    const done = render(<StatusLabel value="done" label="Done" />).container
    const completed = render(<StatusLabel value="completed" label="Completed" size="small" />).container
    expect(done.querySelector('svg')!.className.baseVal).toContain('tabler-icon-circle-check')
    expect(completed.querySelector('svg')!.className.baseVal).toContain('tabler-icon-circle-check')
    expect(done.firstElementChild).toHaveClass('text-text-secondary')
    expect(completed.firstElementChild).toHaveClass('text-text-secondary')
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
