import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { StatusIcon } from '@/components/ui/StatusIcon'
import { WithTooltip } from '@/components/ui/Tooltip'

/**
 * One issue, one 36px line (ruling C15): status icon · ref · title · spacer ·
 * assignee's face · relative time. The title is the only emphasised thing;
 * everything else steps down. The whole row is the link.
 *
 * The ref is decoration — refs collide across projects — so it is shown and
 * never used to identify anything; an issue without one shows an em dash
 * (audit L2), not a blank. The assignee is a face, never a key; unassigned
 * draws nothing rather than a placeholder that looks like a person.
 *
 * Ship-only: it knows what an issue is.
 */
export interface IssueRowData {
  /** The identity. */
  addr: string
  ref?: string
  title: string
  status: string
  assignee?: { name?: string; picture?: string }
  /** Seconds — when it was last touched, as production's table reads it. */
  at: number
}

export interface IssueRowProps {
  issue: IssueRowData
  href: string
  className?: string
}

export function IssueRow({ issue, href, className }: IssueRowProps) {
  return (
    <a
      href={href}
      className={cn(
        'flex h-9 min-w-0 items-center gap-3 rounded-md px-2 text-body-2 transition-colors hover:bg-bg-hover',
        className,
      )}
    >
      <StatusIcon value={issue.status} />
      <span className={cn('w-14 shrink-0 font-mono text-caption', issue.ref ? 'text-text-muted' : 'text-text-disabled')}>
        {issue.ref ?? '—'}
      </span>
      <span className="min-w-0 flex-1 truncate text-text-primary">{issue.title}</span>
      {issue.assignee && (
        <WithTooltip label={issue.assignee.name ?? '—'}>
          <Avatar name={issue.assignee.name} src={issue.assignee.picture} size={20} />
        </WithTooltip>
      )}
      <span className="w-14 shrink-0 text-right text-caption tabular-nums text-text-muted">{ago(issue.at)}</span>
    </a>
  )
}
