import { IconBox, IconMessage2 } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { statusLabel, type StatusEntry } from '@/lib/issues'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { StatusShape } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'

/**
 * One issue, as a list row (Katerina, 2026-09-09, with Linear's row as the
 * picture): one line, no border, a hover surface, no checkbox. Left to
 * right — the ref in mono at a fixed width so the titles align, the status
 * shape, the title; on the right the project as a chip, how many
 * conversations, the assignee's face, and when it was opened. It was a
 * bordered card of two lines with the description clamped under the title
 * (2026-08-26); the description is the issue page's now.
 *
 * The count sits inline rather than on a second line (her first sketch)
 * so every row is one height — 40px, the table's row. The ref is
 * decoration — refs collide across projects — so it is shown and never
 * used to identify anything; an issue without one shows an em dash (audit
 * L2). People are faces and names, never keys. A parentless issue (B10)
 * shows no chip. Ship-only: it knows what an issue is.
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
  status: string
  /** The parent project, as the chip names it. Absent for a parentless issue. */
  project?: { title: string }
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
      className={cn('flex h-10 min-w-0 items-center gap-3 rounded-md px-2 transition-colors hover:bg-bg-hover', className)}
    >
      {/* `w-14`: 56px, the room the project table's ref cell has (S25), so
          the two surfaces line up. */}
      <span className={cn('w-14 shrink-0 truncate font-mono text-caption', issue.ref ? 'text-text-muted' : 'text-text-disabled')}>{issue.ref ?? '—'}</span>
      <StatusShape value={issue.status} label={statusLabel(issue.status, statuses)} />
      <span className="min-w-0 flex-1 truncate text-body-2-strong text-text-primary">{issue.title}</span>
      {issue.project && <Chip label={issue.project.title} leadingIcon={<IconBox size={12} stroke={1.5} />} className="max-w-[200px] shrink-0" />}
      {threads > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-text-muted"
          aria-label={`${threads} ${threads === 1 ? 'conversation' : 'conversations'}`}
        >
          <IconMessage2 size={14} stroke={1.5} aria-hidden="true" />
          {threads}
        </span>
      )}
      {issue.assignee && <Avatar name={issue.assignee.name} src={issue.assignee.picture} size={16} label={issue.assignee.name} />}
      {/* A fixed column, right-aligned, so the times stack down the list. */}
      <span className="w-16 shrink-0 text-right text-caption tabular-nums text-text-muted">{ago(issue.at)}</span>
    </a>
  )
}
