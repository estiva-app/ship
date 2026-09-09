import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupByStatus, statusLabel } from '@/lib/issues'
import { ISSUES, ISSUE_STATUSES, ROWS, THREADS, hrefFor } from '@/fixtures/issues'
import { Breadcrumb } from './ui/Breadcrumb'
import { EditableText } from './ui/EditableText'
import { Board } from './Board'
import { MessageCard } from './ConversationThread'
import { IssueList } from './IssueList'
import { IssueRow } from './IssueRow'
import { IssuesTable } from './IssuesTable'

describe('groupByStatus — production’s rule', () => {
  it('follows the vocabulary’s order, drops empty groups, and shows an unknown status in its own group', () => {
    const groups = groupByStatus(ROWS, ISSUE_STATUSES)
    expect(groups.map((g) => g.status)).toEqual(['todo', 'in_progress', 'done', 'cancelled', 'blocked'])
    expect(groups.find((g) => g.status === 'blocked')?.label).toBe('blocked')
    expect(groupByStatus([], ISSUE_STATUSES)).toEqual([])
    expect(statusLabel('in_progress', ISSUE_STATUSES)).toBe('In Progress')
    expect(statusLabel('blocked', ISSUE_STATUSES)).toBe('blocked')
  })

  /**
   * Moved from `scripts/app.test.ts` in REW-9, where it sat under the heading
   * "an issue is never invisible" and covered `byStatus` in the old app's
   * `views/issue-list.ts`. Everything else that file asserted about grouping was
   * already covered above; this was not, and it is the one that matters most —
   * the others describe how groups are *arranged*, and this is the only one that
   * says nothing was dropped on the way.
   */
  it('never loses an issue: every one appears in exactly one group', () => {
    const groups = groupByStatus(ROWS, ISSUE_STATUSES)
    expect(groups.reduce((total, group) => total + group.items.length, 0)).toBe(ROWS.length)
    const seen = groups.flatMap((group) => group.items.map((item) => item.addr))
    expect(new Set(seen).size).toBe(ROWS.length)
  })
})

describe('IssueRow', () => {
  it('shows an em dash for a missing ref, stretches the issue link over the row, links the project on its own, and never a key', () => {
    const { container } = render(<IssueRow issue={ROWS[4]} statuses={ISSUE_STATUSES} href="#/issue/x" />)
    // Two links, no link inside a link (S26): the issue — ref, shape, title —
    // stretched over the row, and the project chip above the stretch.
    const [issue, project] = screen.getAllByRole('link')
    expect(issue).toHaveAttribute('href', '#/issue/x')
    expect(issue.className).toContain('after:absolute')
    expect(project).toHaveAttribute('href', '#/p/rel')
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}/)
  })
})

describe('IssueList', () => {
  it('shows every group with a title and a bare count — no accordion', () => {
    render(<IssueList issues={ROWS} statuses={ISSUE_STATUSES} hrefFor={hrefFor} />)
    expect(screen.getByText('Empty states read as broken screens')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5)
  })

  it('says so when there is nothing', () => {
    render(<IssueList issues={[]} statuses={ISSUE_STATUSES} hrefFor={hrefFor} />)
    expect(screen.getByText('No issues yet.')).toBeInTheDocument()
  })
})

describe('IssuesTable and Board', () => {
  it('the table prints labels for statuses and em dashes for what is missing', () => {
    render(<IssuesTable issues={ISSUES} statuses={ISSUE_STATUSES} hrefFor={hrefFor} />)
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0)
    expect(screen.getByText('blocked')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('the board has one column per status, with counts', () => {
    render(<Board issues={ROWS.slice(0, 2)} statuses={ISSUE_STATUSES} hrefFor={hrefFor} />)
    for (const entry of ISSUE_STATUSES) expect(screen.getByText(entry.label)).toBeInTheDocument()
    // Two in-progress issues: the other three columns say so. No column for 'blocked' — not in the vocabulary.
    expect(screen.getAllByText('Nothing here')).toHaveLength(3)
  })
})

describe('EditableText', () => {
  it('commits on Enter, cancels on Escape, and keeps the field open when the save fails', async () => {
    const onCommit = vi.fn().mockResolvedValue(false)
    render(<EditableText label="Title" value="Old" placeholder="Untitled" onCommit={onCommit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }))
    const field = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(field, { target: { value: 'New' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('New'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('New')

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Edit title' })).toHaveTextContent('Old')
  })

  it('does not commit an unchanged value', () => {
    const onCommit = vi.fn()
    render(<EditableText label="Title" value="Same" placeholder="Untitled" onCommit={onCommit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('Breadcrumb', () => {
  it('links every item but the last, which is the current page', () => {
    render(<Breadcrumb items={[{ label: 'Issues', href: '#/issues' }, { label: 'Relay Migration', href: '#/p' }, { label: 'REL-6', mono: true }]} />)
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Issues', 'Relay Migration'])
    expect(screen.getByText('REL-6')).toHaveAttribute('aria-current', 'page')
  })
})

describe('MessageCard', () => {
  it('names the author as a person or an em dash, never a key, and keeps the body as text', () => {
    const { container } = render(<MessageCard message={{ ...THREADS[0].replies[1], author: {}, body: '<b>not markup</b>' }} />)
    expect(container.textContent).toContain('—')
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}/)
  })
})
