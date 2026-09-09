import { IconListDetails } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { groupByStatus, type StatusEntry } from '@/lib/issues'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { IssueRow, type IssueRowData } from './IssueRow'

/**
 * A status group: a title — the shaped icon, the label and a bare mono
 * count, the sidebar's treatment — then its rows, touching, as list rows
 * do (2026-09-09; they were cards with 8px between). Not an accordion
 * (Katerina, 2026-08-27: "just the status titles"); everything is visible.
 */
export interface IssueGroupProps {
  status: string
  label: string
  issues: IssueRowData[]
  statuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
}

export function IssueGroup({ status, label, issues, statuses, hrefFor }: IssueGroupProps) {
  return (
    <section className="flex flex-col gap-px">
      <h3 className="flex h-8 items-center gap-2 px-2">
        <StatusLabel value={status} label={label} strong />
        <span className="font-mono text-caption tabular-nums text-text-muted">{issues.length}</span>
      </h3>
      {issues.map((issue) => (
        <IssueRow key={issue.addr} issue={issue} statuses={statuses} href={hrefFor(issue)} />
      ))}
    </section>
  )
}

/**
 * The grouped list every surface uses: the vocabulary's order, empty groups
 * dropped, an unknown status in its own group, shown raw.
 */
export interface IssueListProps {
  issues: IssueRowData[]
  statuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  emptyMessage?: string
  className?: string
}

export function IssueList({ issues, statuses, hrefFor, emptyMessage = 'No issues yet.', className }: IssueListProps) {
  if (!issues.length) return <EmptyState icon={<IconListDetails size={16} stroke={1.5} />} className={cn('py-12', className)} message={emptyMessage} />
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {groupByStatus(issues, statuses).map((group) => (
        <IssueGroup key={group.status} status={group.status} label={group.label} issues={group.items} statuses={statuses} hrefFor={hrefFor} />
      ))}
    </div>
  )
}
