import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { statusLabel, type StatusEntry } from '@/lib/issues'
import { Avatar } from '@/components/ui/Avatar'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'

/**
 * One issue, as production's row (Katerina, 2026-08-26): a bordered card of
 * two lines. The title on the first; on the second, small and quiet — the
 * ref in mono, the status with its shaped icon right after it, the assignee
 * as a face and a name, who opened it and when, and how many conversations
 * it has. The whole card is the link.
 *
 * The ref is decoration — refs collide across projects — so it is shown and
 * never used to identify anything; an issue without one shows an em dash
 * (audit L2), not a blank. People are faces and names, never keys.
 * Ship-only: it knows what an issue is.
 */
export interface IssueRowData {
  /** The identity. */
  addr: string
  /**
   * The `d` — the uuid half of the address, and the only part a URL carries
   * under RFC 0.5 §7.2. Here because a row is what a link is built from.
   */
  id: string
  ref?: string
  title: string
  /** Shown under the title, clamped to two lines, as production does. */
  description?: string
  status: string
  assignee?: { name?: string; picture?: string }
  openedBy?: { name?: string; picture?: string }
  /** Seconds — when it was opened. */
  at: number
  /** Threads about this issue. */
  conversations?: number
}

export interface IssueRowProps {
  issue: IssueRowData
  statuses: StatusEntry[]
  href: string
  className?: string
}

export function IssueRow({ issue, statuses, href, className }: IssueRowProps) {
  const threads = issue.conversations ?? 0
  return (
    <a
      {...linkTo(href)}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 transition-colors hover:border-border-strong',
        className,
      )}
    >
      <span className="truncate text-body-2-strong text-text-primary">{issue.title}</span>
      {issue.description && <span className="line-clamp-2 text-body-2 text-text-secondary">{issue.description}</span>}
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
        <span className={cn('font-mono', issue.ref ? 'text-text-muted' : 'text-text-disabled')}>{issue.ref ?? '—'}</span>
        <StatusLabel value={issue.status} label={statusLabel(issue.status, statuses)} size="small" />
        {issue.assignee && (
          <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
            <Avatar name={issue.assignee.name} src={issue.assignee.picture} size={16} />
            <span className="truncate">{issue.assignee.name ?? '—'}</span>
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5">
          opened by
          {issue.openedBy && <Avatar name={issue.openedBy.name} src={issue.openedBy.picture} size={16} />}
          <span className="truncate">{issue.openedBy?.name ?? '—'}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{ago(issue.at)}</span>
        </span>
        {threads > 0 && (
          <span className="shrink-0">
            {threads} {threads === 1 ? 'conversation' : 'conversations'}
          </span>
        )}
      </span>
    </a>
  )
}
