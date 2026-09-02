import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { statusLabel, type StatusEntry } from '@/lib/issues'
import { Person } from '@/components/ui/Person'
import { StatusLabel } from '@/components/ui/StatusLabel'
import type { IssueRowData } from './IssueRow'

/**
 * The project page's table view, as production: ref · Title · Status ·
 * Assignee · Opened by · Updated. Scrolls inside its own container rather
 * than widening the page — a horizontally scrolling *page* would take the
 * sidebar with it. Fixed layout with a real minimum width, so the title
 * column keeps its room and a narrow container scrolls the table rather
 * than crushing the titles. Same cells as the row renders, aligned as a grid.
 *
 * A missing ref is an em dash (audit L2); people are faces and names, never
 * keys; a status the vocabulary does not know is shown raw.
 */
export interface IssuesTableRow extends IssueRowData {
  openedBy: { name?: string; picture?: string }
}

export interface IssuesTableProps {
  issues: IssuesTableRow[]
  statuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  className?: string
}

// Sizes spelled as arbitrary values, not tokens: these strings go through cn(),
// and tailwind-merge drops a custom text-size class that is followed by a
// text-{colour} class (the pitfall Peek's config records). The header is the
// menu token (9/115%/500); the ref is the caption token (12); everything else
// in a cell, the date included, is the table's own 14 (Katerina, 2026-08-26).
const TH = 'h-9 px-3 text-left text-[9px] font-medium uppercase leading-[115%] tracking-[0.08em] text-text-secondary'
const TD = 'h-10 px-3 text-body-2'
const SMALL = 'text-[12px] leading-[120%]'

export function IssuesTable({ issues, statuses, hrefFor, className }: IssuesTableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border-default', className)}>
      <table className="w-full min-w-[840px] table-fixed border-collapse">
        <thead className="bg-bg-surface">
          <tr className="border-b border-border-default">
            <th className={cn(TH, 'w-16')}>
              <span className="sr-only">Ref</span>
            </th>
            <th className={TH}>Title</th>
            <th className={cn(TH, 'w-32')}>Status</th>
            <th className={cn(TH, 'w-40')}>Assignee</th>
            <th className={cn(TH, 'w-40')}>Opened by</th>
            <th className={cn(TH, 'w-24')}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.addr} className="border-b border-border-subtle last:border-b-0 hover:bg-bg-hover">
              {/* A dash while Ship has not numbered this one yet — an issue created
                  through the manifest by another app arrives without a key, and
                  the project page assigns one. Nothing to click: it is the
                  app's bookkeeping, not a chore for whoever opened the page. */}
              <td className={cn(TD, 'font-mono', SMALL, issue.ref ? 'text-text-muted' : 'text-text-disabled')}>{issue.ref ?? '—'}</td>
              <td className={TD}>
                <a href={hrefFor(issue)} className="block truncate text-text-primary hover:underline">
                  {issue.title}
                </a>
              </td>
              <td className={TD}>
                <StatusLabel value={issue.status} label={statusLabel(issue.status, statuses)} />
              </td>
              <td className={cn(TD, 'text-text-secondary')}>
                {issue.assignee ? <Person name={issue.assignee.name} picture={issue.assignee.picture} size={16} /> : <span className="text-text-muted">—</span>}
              </td>
              <td className={cn(TD, 'text-text-secondary')}>
                <Person name={issue.openedBy.name} picture={issue.openedBy.picture} size={16} />
              </td>
              <td className={cn(TD, 'whitespace-nowrap tabular-nums text-text-muted')}>{ago(issue.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
