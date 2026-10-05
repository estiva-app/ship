import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IssueRail } from './IssueRail'
import { ProjectRail, type RailFolder } from './ProjectRail'

const FOLDER = '5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34'
const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
]
const PEOPLE = [{ value: 'ana', name: 'Ana Duarte' }]

describe('ProjectRail', () => {
  const rail = (folders: RailFolder[] | null | undefined, onMove?: () => void) => (
    <ProjectRail
      status="in_progress"
      statuses={STATUSES}
      onStatusChange={vi.fn()}
      lead="ana"
      people={PEOPLE}
      onLeadChange={vi.fn()}
      done={10}
      total={14}
      folders={folders}
      onMove={onMove}
      archived={false}
      onArchive={vi.fn()}
      onDelete={vi.fn()}
    />
  )

  it('lays out production’s rail: the four properties, the progress words, the Folder by name, and every action as a small button', () => {
    const { container } = render(rail([{ name: 'Ship', href: `/app/folder/${FOLDER}` }]))
    for (const label of ['Status', 'Assignee', 'Progress', 'Folder']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Issues done' })).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByText('10 of 14 done')).toBeInTheDocument()
    // The Folder it is in, by name, opening that Folder's page (FOL-3).
    expect(screen.getByRole('link', { name: 'Ship' })).toHaveAttribute('href', `/app/folder/${FOLDER}`)
    // The assignee select shows the chosen person's face before the name.
    expect(screen.getByRole('combobox', { name: 'Assignee' }).querySelector('svg')).not.toBeNull()
    for (const name of ['Archive project', 'Delete project']) expect(screen.getByRole('button', { name })).toHaveClass('h-6')
    // No pairing is left: no link to copy, nothing to pair with, and no id on the rail at all.
    expect(screen.queryByRole('button', { name: /Folder link|Pair/ })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}|pair/i)
  })

  it('draws a dash for a project in no Folder, and a placeholder while the Folders are read', () => {
    const { rerender } = render(rail([]))
    expect(screen.getByText('—')).toBeInTheDocument()
    // A read that returned no Folders is not the same claim as "in none".
    rerender(rail(null))
    expect(screen.getByText('Folders could not be read')).toBeInTheDocument()
    rerender(rail(undefined))
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('"Move to Folder…" sits under the Folder once the Folders are read, in none as well as in one (FOL-7)', () => {
    const onMove = vi.fn()
    const { rerender } = render(rail([{ name: 'Ship', href: `/app/folder/${FOLDER}` }], onMove))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Folder…' }))
    expect(onMove).toHaveBeenCalled()
    rerender(rail([], onMove))
    expect(screen.getByRole('button', { name: 'Move to Folder…' })).toBeInTheDocument()
    rerender(rail(undefined, onMove))
    expect(screen.queryByRole('button', { name: 'Move to Folder…' })).not.toBeInTheDocument()
    rerender(rail([{ name: 'Ship', href: `/app/folder/${FOLDER}` }]))
    expect(screen.queryByRole('button', { name: 'Move to Folder…' })).not.toBeInTheDocument()
  })
})

describe('IssueRail', () => {
  it('names who opened it as a person, never a key, and offers the Peek reference and Delete', () => {
    const onCopyReference = vi.fn()
    const onDelete = vi.fn()
    render(
      <IssueRail
        status="todo"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        assignee=""
        people={PEOPLE}
        onAssigneeChange={vi.fn()}
        project=""
        projects={[{ value: '', label: 'No project' }]}
        onProjectChange={vi.fn()}
        openedBy={{}}
        openedAt={Math.floor(Date.now() / 1000) - 36000}
        onCopyReference={onCopyReference}
        onDelete={onDelete}
      />,
    )
    expect(screen.getByText(/Opened by/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/10h ago/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy reference for Peek' }))
    expect(onCopyReference).toHaveBeenCalledTimes(1)
    // Offered to everyone; the relay decides who may (SHI-14, and SHI-3 for issues).
    fireEvent.click(screen.getByRole('button', { name: 'Delete issue' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

describe('a write control that cannot succeed says why', () => {
  const REASON = 'You do not have write access to this Folder.'

  /*
    `disabledReason` (@estiva-app/ui 0.8.0) replaced six hand-written wrappers
    in Ship: a disabled Button inside a WithTooltip, chosen by a ternary. What
    the prop adds over that is Base UI's `focusableWhenDisabled` — the button
    is disabled but still reachable by Tab, so the reason can be found without
    a mouse. These pin the three claims so a later refactor cannot quietly drop
    them.
  */
  it('disables every action in the project rail, keeps each reachable by keyboard, and calls nothing', () => {
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    render(
      <ProjectRail
        status="in_progress"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        lead="ana"
        people={PEOPLE}
        onLeadChange={vi.fn()}
        done={10}
        total={14}
        folders={[{ name: 'Ship', href: `/app/folder/${FOLDER}` }]}
        archived={false}
        onArchive={onArchive}
        onDelete={onDelete}
        readOnlyReason={REASON}
      />,
    )
    for (const name of ['Archive project', 'Delete project']) {
      const button = screen.getByRole('button', { name })
      // Base UI's `focusableWhenDisabled` spells disablement with aria, not the
      // `disabled` attribute, precisely so the control keeps its tab stop.
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(button.getAttribute('tabindex')).toBe('0')
      fireEvent.click(button)
    }
    // The Folder is a link, not a write, so it stays open.
    expect(screen.getByRole('link', { name: 'Ship' })).not.toHaveAttribute('aria-disabled')
    expect(onArchive).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('leaves the issue rail’s read-only actions alone when there is no reason', () => {
    const onDelete = vi.fn()
    render(
      <IssueRail
        status="planned"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        assignee=""
        people={PEOPLE}
        onAssigneeChange={vi.fn()}
        project=""
        projects={[{ value: '', label: 'No project' }]}
        onProjectChange={vi.fn()}
        openedBy={{}}
        openedAt={Math.floor(Date.now() / 1000)}
        onCopyReference={vi.fn()}
        onDelete={onDelete}
      />,
    )
    const button = screen.getByRole('button', { name: 'Delete issue' })
    expect(button.getAttribute('aria-disabled')).toBe(null)
    fireEvent.click(button)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

describe('an archived file’s rail: its fields shut, Unarchive and Delete open (SHI-36)', () => {
  const LOCKED = 'Unarchive to edit'

  it('shuts the issue rail’s three selects and leaves Unarchive and Delete working', () => {
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    render(
      <IssueRail
        status="planned"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        assignee=""
        people={PEOPLE}
        onAssigneeChange={vi.fn()}
        project=""
        projects={[{ value: '', label: 'No project' }]}
        onProjectChange={vi.fn()}
        openedBy={{}}
        openedAt={Math.floor(Date.now() / 1000)}
        onCopyReference={vi.fn()}
        archived
        onArchive={onArchive}
        onDelete={onDelete}
        lockedReason={LOCKED}
      />,
    )
    for (const name of ['Status', 'Assignee', 'Project']) expect(screen.getByRole('combobox', { name }).getAttribute('aria-disabled')).toBe('true')
    for (const name of ['Unarchive issue', 'Delete issue']) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('aria-disabled')).toBe(null)
      fireEvent.click(button)
    }
    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('shuts Archive on an issue locked only by its project’s archive — archiving it again would be an edit', () => {
    const onArchive = vi.fn()
    render(
      <IssueRail
        status="planned"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        assignee=""
        people={PEOPLE}
        onAssigneeChange={vi.fn()}
        project=""
        projects={[{ value: '', label: 'No project' }]}
        onProjectChange={vi.fn()}
        openedBy={{}}
        openedAt={Math.floor(Date.now() / 1000)}
        onCopyReference={vi.fn()}
        archived={false}
        onArchive={onArchive}
        onDelete={vi.fn()}
        lockedReason="Unarchive its project to edit"
      />,
    )
    const archive = screen.getByRole('button', { name: 'Archive issue' })
    expect(archive.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(archive)
    expect(onArchive).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete issue' }).getAttribute('aria-disabled')).toBe(null)
  })

  it('shuts the project rail’s selects and Move, and leaves Unarchive and Delete working', () => {
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    const onMove = vi.fn()
    render(
      <ProjectRail
        status="in_progress"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        lead="ana"
        people={PEOPLE}
        onLeadChange={vi.fn()}
        done={10}
        total={14}
        folders={[{ name: 'Ship', href: `/app/folder/${FOLDER}` }]}
        onMove={onMove}
        archived
        onArchive={onArchive}
        onDelete={onDelete}
        lockedReason={LOCKED}
      />,
    )
    for (const name of ['Status', 'Assignee']) expect(screen.getByRole('combobox', { name }).getAttribute('aria-disabled')).toBe('true')
    const move = screen.getByRole('button', { name: 'Move to Folder…' })
    expect(move.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(move)
    expect(onMove).not.toHaveBeenCalled()
    for (const name of ['Unarchive project', 'Delete project']) fireEvent.click(screen.getByRole('button', { name }))
    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
