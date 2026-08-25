import { cn } from '@/lib/cn'
import type { StatusEntry } from '@/lib/issues'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { StatusLabel } from '@/components/ui/StatusLabel'
import type { IssueRowData } from './IssueRow'

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
export function BoardCard({ issue, href }: { issue: IssueRowData; href: string }) {
  return (
    <a
      href={href}
      className="flex flex-col gap-1.5 rounded-md border border-border-default bg-bg-elevated p-2 transition-colors hover:border-border-strong"
    >
      {issue.ref && <span className="font-mono text-caption text-text-muted">{issue.ref}</span>}
      <span className="text-body-2 text-text-primary">{issue.title}</span>
      {issue.assignee && (
        <span className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Avatar name={issue.assignee.name} src={issue.assignee.picture} size={16} />
          <span className="truncate">{issue.assignee.name ?? '—'}</span>
        </span>
      )}
    </a>
  )
}

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
    <section className="flex min-h-40 min-w-0 flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-2">
      <header className="flex h-7 items-center gap-2 px-1">
        <StatusLabel value={status} label={label} strong />
        <Chip label={String(issues.length)} />
      </header>
      <div className="flex flex-col gap-1.5">
        {issues.map((issue) => (
          <BoardCard key={issue.addr} issue={issue} href={hrefFor(issue)} />
        ))}
        {!issues.length && <span className="px-1 py-2 text-caption text-text-muted">Nothing here</span>}
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

export function Board({ issues, statuses, hrefFor, className }: BoardProps) {
  return (
    <div className={cn('grid grid-flow-col auto-cols-[minmax(170px,1fr)] gap-2 overflow-x-auto pb-1.5', className)}>
      {statuses.map((entry) => (
        <BoardColumn
          key={entry.value}
          status={entry.value}
          label={entry.label}
          issues={issues.filter((issue) => issue.status === entry.value)}
          hrefFor={hrefFor}
        />
      ))}
    </div>
  )
}
