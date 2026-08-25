import { useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { groupByStatus, type StatusEntry } from '@/lib/issues'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { IssueRow, type IssueRowData } from './IssueRow'

/**
 * A status group: a header with the shaped icon, the label and a count, then
 * its rows. Collapsible; "Done" starts collapsed (ruling C15) so the work
 * still open is what a page shows first.
 */
export interface IssueGroupProps {
  status: string
  label: string
  issues: IssueRowData[]
  hrefFor: (issue: IssueRowData) => string
  defaultCollapsed?: boolean
}

export function IssueGroup({ status, label, issues, hrefFor, defaultCollapsed = false }: IssueGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const Chevron = collapsed ? IconChevronRight : IconChevronDown
  return (
    <section className="flex flex-col gap-px">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-bg-hover"
      >
        <Chevron size={14} stroke={1.5} className="shrink-0 text-text-muted" />
        <StatusIcon value={status} />
        <span className="text-body-2-strong text-text-primary">{label}</span>
        <Chip label={String(issues.length)} />
      </button>
      {!collapsed && issues.map((issue) => <IssueRow key={issue.addr} issue={issue} href={hrefFor(issue)} />)}
    </section>
  )
}

/**
 * The grouped list every surface uses (ruling C15): the vocabulary's order,
 * empty groups dropped, an unknown status in its own group, shown raw.
 */
export interface IssueListProps {
  issues: IssueRowData[]
  statuses: StatusEntry[]
  hrefFor: (issue: IssueRowData) => string
  /** Groups that start collapsed. Production shows all; the ruling collapses done. */
  collapsed?: string[]
  emptyMessage?: string
  className?: string
}

export function IssueList({ issues, statuses, hrefFor, collapsed = ['done'], emptyMessage = 'No issues yet.', className }: IssueListProps) {
  if (!issues.length) return <EmptyState className={cn('py-12', className)} message={emptyMessage} />
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {groupByStatus(issues, statuses).map((group) => (
        <IssueGroup
          key={group.status}
          status={group.status}
          label={group.label}
          issues={group.items}
          hrefFor={hrefFor}
          defaultCollapsed={collapsed.includes(group.status)}
        />
      ))}
    </div>
  )
}
