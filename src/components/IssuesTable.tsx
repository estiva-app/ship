import { Card, Link } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { statusLabel, type StatusEntry } from '@/lib/issues'
import { Person } from '@/components/ui/Person'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { StatusLabel } from '@/components/ui/StatusLabel'
import type { IssueRowData } from './IssueRow'
import { linkTo } from '@/router'

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
 *
 * A row opens its issue wherever it is clicked, as the list's row does: the
 * title is the package's `Link` with `cover`, over a `relative` row (UIG-33,
 * Katerina 28 September). Before, the whole row lit up on hover while only
 * the title opened anything.
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

// The type tokens (S6, 0.10.0): the header is the menu token (9/115%/500)
// with the table's own tracking; the ref is the caption token (12); everything
// else in a cell, the date included, is body-2, the table's own 14 (Katerina,
// 2026-08-26). These were arbitrary values while tailwind-merge dropped a
// token size beside a colour class; the package's cn() names the ramp now.
// @estiva-escape(no-copied-look): B3 (Katerina, 24 September: record only): a table header in the label style Property also uses; a table part is for later
const TH_CLASSES = 'h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary'
const TD = 'h-10 px-3 text-body-2'
const SMALL = 'text-caption'

export function IssuesTable({ issues, statuses, hrefFor, className }: IssuesTableProps) {
  return (
    /* A table wider than its box scrolls sideways in a ScrollArea (D40): the
       bar takes no height, so the box is exactly as tall with a bar as
       without. `overflow-hidden` keeps the corners round, as the scrolling
       box itself used to. The frame is a box of our own around the region,
       not pushed into it (UIG-9). */
    <Card clip fill="none" className={className}>
    <ScrollArea orientation="horizontal">
      <table className="w-full min-w-[840px] table-fixed border-collapse">
        <thead className="bg-bg-surface">
          <tr className="border-b border-border-default">
            {/* `relative` is load-bearing: `sr-only` is position:absolute, and
                with no positioned ancestor its containing block is the viewport
                — it escapes every scroll container on the page and hands the
                document its static position as scroll range. On any project
                whose description pushes this table below the first screen, the
                WHOLE page (sidebar and top bar included) became scrollable by
                exactly that distance. */}
            {/* `w-20`, and the cell never wraps (Katerina, 2026-09-09; ADOPTION
                S25): under `border-box` the 64px of `w-16` left 40px for text
                once `px-3` was paid, and "PEE-27" at 12px Geist Mono needs 43 —
                five characters fit, six broke onto a second line. 80px leaves
                56px, which holds three letters, a dash and three digits
                (`refPrefix` takes three letters); the Issues page's list row
                uses the same width, so the two surfaces line up. */}
            <th className={cn(TH_CLASSES, 'relative w-20')}>
              <span className="sr-only">Ref</span>
            </th>
            <th className={TH_CLASSES}>Title</th>
            <th className={cn(TH_CLASSES, 'w-32')}>Status</th>
            <th className={cn(TH_CLASSES, 'w-40')}>Assignee</th>
            <th className={cn(TH_CLASSES, 'w-40')}>Opened by</th>
            <th className={cn(TH_CLASSES, 'w-24')}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.addr} className="relative border-b border-border-subtle last:border-b-0 hover:bg-bg-hover">
              {/* A dash while Ship has not numbered this one yet — an issue created
                  through the manifest by another app arrives without a key, and
                  the project page assigns one. Nothing to click: it is the
                  app's bookkeeping, not a chore for whoever opened the page. */}
              <td className={cn(TD, 'whitespace-nowrap font-mono', SMALL, issue.ref ? 'text-text-muted' : 'text-text-disabled')}>{issue.ref ?? '—'}</td>
              <td className={TD}>
                <div className="text-text-primary">
                  <Link {...linkTo(hrefFor(issue))} variant="quiet" truncate cover className="block">
                    {issue.title}
                  </Link>
                </div>
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
    </ScrollArea>
    </Card>
  )
}
