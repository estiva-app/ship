/**
 * A file's summary in Ship's lists (SUM-4, part 2): the board's card and the
 * project card draw it as its own line under the title, and with none draw
 * the title alone. The project card's summary replaces the description it
 * used to cut short. As the short-summary prototype draws them (Miky, 15 Oct).
 * The issue list's row and the table's Title cell draw the title alone and
 * show the summary on hover (Miky, SUM-9, 17 Oct).
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DirectoryView, FolderState } from '@/api'
import type { Archives } from '@/lib/archive'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { BoardCard } from './Board'
import { IssueRow, type IssueRowData } from './IssueRow'
import { IssuesTable } from './IssuesTable'
import { ProjectCard } from './ProjectCard'

const STATUSES = [{ value: 'todo', label: 'Todo' }]
const SUMMARY = 'Totals on the invoice are off by one cent.'
const ISSUE: IssueRowData = { addr: '30851:a:1', id: '1', ref: 'BIL-1', title: 'Invoice totals', summary: SUMMARY, status: 'todo', at: Math.floor(Date.now() / 1000) }
const BARE: IssueRowData = { ...ISSUE, addr: '30851:a:2', id: '2', ref: 'BIL-2', title: 'No summary here', summary: undefined }

/** The summary is drawn after the title in reading order: under it, never before it. */
function expectAfterTitle(title: string, summary: string) {
  const t = screen.queryByText(title)
  const s = screen.queryByText(summary)
  expect(t).not.toBeNull()
  expect(s).not.toBeNull()
  expect(t!.compareDocumentPosition(s!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

/** Hovers `link` and returns the tooltip's text once it opens, or null when none does. */
async function hoverTooltip(link: HTMLElement): Promise<string | null> {
  // `shouldAdvanceTime`: user-event's act wrapper waits on a setTimeout(0), which a clock that never moves never fires.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).hover(link)
    // Past the tooltip's 300ms wait (D23).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    return screen.queryByRole('tooltip')?.textContent ?? null
  } finally {
    vi.useRealTimers()
  }
}

describe('the issue list row', () => {
  it('draws the title alone, and hovering the link that opens the issue shows the summary; without one, no tooltip', async () => {
    const { unmount } = render(<IssueRow issue={ISSUE} statuses={STATUSES} href="#/issue/1" />)
    expect(screen.getByRole('link').textContent).toBe('BIL-1Invoice totals')
    expect(await hoverTooltip(screen.getByRole('link'))).toBe(SUMMARY)
    unmount()
    render(<IssueRow issue={BARE} statuses={STATUSES} href="#/issue/2" />)
    expect(screen.getByRole('link').textContent).toBe('BIL-2No summary here')
    expect(await hoverTooltip(screen.getByRole('link'))).toBeNull()
  })

  it('shows a summary in the tooltip as typed: no markup read and no link made of it', async () => {
    render(<IssueRow issue={{ ...ISSUE, summary: '**Bold** and https://example.com' }} statuses={STATUSES} href="#/issue/1" />)
    expect(await hoverTooltip(screen.getByRole('link'))).toBe('**Bold** and https://example.com')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})

describe('the board card', () => {
  it('draws the summary under the title; without one, the title alone', () => {
    const { unmount } = render(<BoardCard issue={ISSUE} href="#/issue/1" />)
    expect(within(screen.getByRole('link')).queryByText(SUMMARY)).not.toBeNull()
    expectAfterTitle('Invoice totals', SUMMARY)
    unmount()
    render(<BoardCard issue={BARE} href="#/issue/2" />)
    expect(screen.getByRole('link').textContent).toBe('BIL-2No summary here')
  })
})

describe('the issues table', () => {
  it('draws the title alone in the Title cell, hovering it shows the summary, and there is no column for it', async () => {
    const { unmount } = render(<IssuesTable issues={[{ ...ISSUE, openedBy: {} }, { ...BARE, openedBy: {} }]} statuses={STATUSES} hrefFor={(issue) => `#/issue/${issue.id}`} />)
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Ref', 'Title', 'Status', 'Assignee', 'Opened by', 'Updated'])
    const link = screen.getByRole('link', { name: 'Invoice totals' })
    expect(link.closest('td')?.textContent).toBe('Invoice totals')
    expect(await hoverTooltip(link)).toBe(SUMMARY)
    unmount()
    render(<IssuesTable issues={[{ ...BARE, openedBy: {} }]} statuses={STATUSES} hrefFor={(issue) => `#/issue/${issue.id}`} />)
    const bare = screen.getByRole('link', { name: 'No summary here' })
    expect(bare.closest('td')?.textContent).toBe('No summary here')
    expect(await hoverTooltip(bare)).toBeNull()
  })
})

const CARD = {
  href: '#/p/x',
  title: 'Billing',
  status: { value: 'planned', label: 'Planned' },
  issueCount: 0,
  doneCount: 0,
  author: { name: 'Ana Duarte' },
  createdAt: Math.floor(Date.now() / 1000) - 86400,
}

describe('the project card', () => {
  it('draws the summary under the title', () => {
    render(<ProjectCard {...CARD} summary={SUMMARY} />)
    expect(within(screen.getByRole('link')).queryByText(SUMMARY)).not.toBeNull()
    expectAfterTitle('Billing', SUMMARY)
  })
})

describe('the projects page', () => {
  const project = (id: string, title: string, description: string, summary?: string) => ({
    addr: `30850:a:${id}`,
    id,
    author: 'a'.repeat(64),
    createdAt: 1,
    title,
    summary,
    description,
    descriptionFormat: 'marker',
    contentFolder: 'f',
    status: 'planned',
    fields: {},
  })
  const page = (projects: ReturnType<typeof project>[]) => {
    const state = { projects, issues: [], conversations: [], activity: [] } as unknown as FolderState
    const directory = { nameOf: () => 'Ana', personOf: () => ({ name: 'Ana' }) } as unknown as DirectoryView
    const archives = { ofProject: () => undefined, ofIssue: () => undefined } as unknown as Archives
    return <ProjectsPage state={state} directory={directory} teams={[]} archives={archives} archived={false} say={vi.fn()} refresh={vi.fn()} />
  }

  it('shows a project’s summary on its card, never its description cut short', () => {
    render(page([project('1', 'Billing', 'The whole plan for billing, written out at length.', SUMMARY)]))
    const card = screen.getByRole('link', { name: /Billing/ })
    expect(within(card).queryByText(SUMMARY)).not.toBeNull()
    expect(card.textContent).not.toContain('The whole plan for billing')
  })

  it('shows no description line on a project with no summary', () => {
    render(page([project('2', 'Payments', 'Take card payments, and everything around them.')]))
    expect(screen.getByRole('link', { name: /Payments/ }).textContent).not.toContain('Take card payments')
  })
})
