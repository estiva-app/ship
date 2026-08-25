import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IssueRail } from './IssueRail'
import { ProjectRail } from './ProjectRail'

const STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
]
const PEOPLE = [{ value: 'ana', name: 'Ana Duarte' }]

describe('ProjectRail', () => {
  it('lays out production’s rail: the four properties, the progress words, the folder id, and every action as a small button', () => {
    const onDelete = vi.fn()
    const { container } = render(
      <ProjectRail
        status="in_progress"
        statuses={STATUSES}
        onStatusChange={vi.fn()}
        lead="ana"
        people={PEOPLE}
        onLeadChange={vi.fn()}
        done={10}
        total={14}
        folder="5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34"
        onCopyFolderLink={vi.fn()}
        onPairFolder={vi.fn()}
        archived={false}
        onArchive={vi.fn()}
        onDelete={onDelete}
      />,
    )
    for (const label of ['Status', 'Assignee', 'Progress', 'Folder']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Issues done' })).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByText('10 of 14 done')).toBeInTheDocument()
    expect(screen.getByText('5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34')).toBeInTheDocument()
    // The assignee select shows the chosen person's face before the name.
    expect(screen.getByRole('button', { name: 'Assignee' }).querySelector('svg')).not.toBeNull()
    for (const name of ['Copy Folder link', 'Pair with another Folder…', 'Archive project', 'Delete project']) {
      expect(screen.getByRole('button', { name })).toHaveClass('h-6')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    // The folder id is the one legitimate hex on the rail; nothing else may be.
    expect(container.textContent!.replace('5c1e2a7b-9d40-4f3a-8e6b-2f0c7d1a9b34', '')).not.toMatch(/[0-9a-f]{8}/)
  })
})

describe('IssueRail', () => {
  it('names who opened it as a person, never a key, and offers the Peek reference', () => {
    const onCopyReference = vi.fn()
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
      />,
    )
    expect(screen.getByText(/Opened by/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/10h ago/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy reference for Peek' }))
    expect(onCopyReference).toHaveBeenCalledTimes(1)
  })
})
