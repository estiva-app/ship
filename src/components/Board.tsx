import { Card } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import type { StatusEntry } from '@/lib/issues'
import { EmptyState } from '@/components/ui/EmptyState'
import { Person } from '@/components/ui/Person'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { StatusLabel } from '@/components/ui/StatusLabel'
import type { IssueRowData } from './IssueRow'
import { SummaryLine } from './SummaryLine'
import { linkTo } from '@/router'

/**
 * The kanban board, as production: one column per status in the vocabulary,
 * each with its shaped icon, label and count, and cards of ref · title ·
 * assignee's face (ruling C15). The columns share the width — production's
 * `minmax(…, 1fr)` grid, with a 170px minimum so four fit beside the rail at
 * 1280 — so the board fills the page (Katerina, 2026-08-27) and only
 * scrolls, inside itself and never the page, once a column would drop below
 * its minimum.
 *
 * Read-only here. Production's drag-and-drop publishes a `kind:1851` exactly
 * as the status dropdown does; that write, and the drag states around it,
 * arrive with REW-5.
 */
/**
 * One issue on the board as a card: its reference, title and the assignee's
 * photo and name, opening the issue when clicked.
 */
export function BoardCard({ issue, href }: { issue: IssueRowData; href: string }) {
  return (
    // The package's Card: the elevated fill on its column, 8px corners (Katerina, 2026-09-14; it was 6px).
    <Card {...linkTo(href)} fill="elevated" className="flex flex-col gap-1.5 p-2">
      {issue.ref && <span className="font-mono text-caption text-text-muted">{issue.ref}</span>}
      <span className="text-body-2 text-text-primary">{issue.title}</span>
      {/* The summary in two lines under the title; none, no line (the short-summary prototype's ShipBoardCard). */}
      <SummaryLine summary={issue.summary} lines={2} className="text-caption" />
      {issue.assignee && (
        // The package's Person: a face beside a name, the em dash for a missing one. A name takes the tone of where it sits (UIG-9).
        <span className="contents text-caption text-text-secondary">
          <Person name={issue.assignee.name} picture={issue.assignee.picture} size={16} />
        </span>
      )}
    </Card>
  )
}

/**
 * One status column on the board: the status name and count, then a card for
 * each issue in it, or a "Nothing here" line.
 */
export function BoardColumn({
  status,
  label,
  issues,
  hrefFor,
}: {
  status: string
  label: string
  issues: IssueRowData[]
  hrefFor: (issue: IssueRowData) => string
}) {
  return (
    // @estiva-escape(no-copied-look): N10 (Katerina, 24 September: record only): a board column is a section with a heading; Card draws a plain box
    <section className="flex min-h-40 min-w-0 flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-2">
      <header className="flex h-7 items-center gap-2 px-1">
        <StatusLabel value={status} label={label} strong />
        {/* @estiva-escape(no-copied-look): B4 (Katerina, 24 September: record only): a count in the mono caption style NavItem's count also uses, not a NavItem */}
        <span className="font-mono text-caption tabular-nums text-text-muted">{issues.length}</span>
      </header>
      <div className="flex flex-col gap-1.5">
        {issues.map((issue) => (
          <BoardCard key={issue.addr} issue={issue} href={hrefFor(issue)} />
        ))}
        {/* The package's quiet line; its room is this box's, since EmptyState takes no padding. */}
        {!issues.length && (
          <div className="px-1 py-2">
            <EmptyState scope="section" message="Nothing here" />
          </div>
        )}
      </div>
    </section>
  )
}

export interface BoardProps {
  issues: IssueRowData[]
  statuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  className?: string
}

/**
 * The kanban board of issues: one column per status, side by side, scrolling
 * sideways when the columns no longer fit.
 */
export function Board({ issues, statuses, hrefFor, className }: BoardProps) {
  return (
    /* The columns scroll sideways in a ScrollArea (D40); the grid moves onto
       the scrolling box, and its bottom padding with it, so nothing moves. */
    <ScrollArea orientation="horizontal" className={className} contentClassName="grid grid-flow-col auto-cols-[minmax(170px,1fr)] gap-2 pb-1.5">
      {statuses.map((entry) => (
        <BoardColumn
          key={entry.value}
          status={entry.value}
          label={entry.label}
          issues={issues.filter((issue) => issue.status === entry.value)}
          hrefFor={hrefFor}
        />
      ))}
    </ScrollArea>
  )
}
