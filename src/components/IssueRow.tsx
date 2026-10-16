import { IconBox } from '@tabler/icons-react'
import { Link } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { statusLabel, type StatusEntry } from '@/lib/issues'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { ConversationCount } from '@/components/ui/ConversationCount'
import { StatusShape } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'
import { SummaryLine } from './SummaryLine'

/**
 * One issue, as a list row (Katerina, 2026-09-09, with Linear's row as the
 * picture): one line, no border, a hover surface, no checkbox. Left to
 * right — the ref in mono at a fixed width so the titles align, the status
 * shape, the title; on the right how many conversations, the project as
 * a chip, the assignee's face, and when it was opened. It was a
 * bordered card of two lines with the description clamped under the title
 * (2026-08-26); the description is the issue page's now. An issue with a
 * summary (SPEC §6.12) takes it as a muted second line under the title, cut
 * to one line; one without keeps the one-line row (the short-summary
 * prototype, Miky 15 Oct).
 *
 * Two links, and no link inside a link: the issue link is the ref, the
 * shape and the title, and it covers the whole row (the package's `Link`
 * `cover`, UIG-33), so a click anywhere opens the issue and the keyboard ring
 * goes round the row — except on the project chip, which is its own link to
 * the project (the package's `Chip` `href`) and sits above the cover (her
 * ask, 2026-09-09). Her second pass the same day: 12px at the
 * sides, 6px between the shape and the title, the title at 400 as the
 * table's is, and 36px tall. The count sits inline rather than on a second
 * line so every row is one height.
 *
 * The ref is decoration — refs collide across projects — so it is shown and
 * never used to identify anything; an issue without one shows an em dash
 * (audit L2). People are faces and names, never keys. A parentless issue
 * (B10) shows no chip. Ship-only: it knows what an issue is.
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
  /** The one-line summary beside the title (SPEC §6.12), from the fold; absent when it has none. */
  summary?: string
  status: string
  /** The parent project, as the chip names it and links to it. Absent for a parentless issue. */
  project?: { title: string; href: string }
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
  const summary = !!issue.summary
  return (
    // With a summary the row takes a second line and everything else sits level with the title (the short-summary
    // prototype's ShipIssueRow); without one it is today's 36px row, centred.
    <div className={cn('relative flex min-w-0 items-start gap-3 rounded-md px-3 transition-colors hover:bg-bg-hover', summary ? 'py-1.5' : 'h-9 items-center', className)}>
      <Link {...linkTo(href)} variant="plain" cover className="flex min-w-0 flex-1 items-start gap-3">
        {/* `w-20 pr-2`: 72px of text, the room the project table's ref cell
            has (S25), so the two surfaces line up — six letters, a dash and
            three digits since keys run to six letters (SHI-4). */}
        {/* @estiva-escape(no-copied-look): B5 (Katerina, 24 September: record only): an issue's ref in the mono caption style Breadcrumb's id also uses */}
        <span className={cn('w-20 shrink-0 truncate pr-2 font-mono text-caption', issue.ref ? 'text-text-muted' : 'text-text-disabled', summary && 'pt-0.5')}>{issue.ref ?? '—'}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusShape value={issue.status} label={statusLabel(issue.status, statuses)} />
            <span className="min-w-0 flex-1 truncate text-body-2 text-text-primary">{issue.title}</span>
          </span>
          {/* Under the title, past the status shape (16px and the 6px gap), one line. */}
          <SummaryLine summary={issue.summary} lines={1} className="pl-[22px] text-caption" />
        </span>
      </Link>
      <span className={cn('flex shrink-0 items-center gap-3', summary && 'pt-0.5')}>
        {/* The count before the chip (Katerina, 2026-09-09): what is said
            about the issue, then where it lives, then who and when. */}
        <ConversationCount count={threads} unit="conversation" />
        {issue.project && (
          <Chip {...linkTo(issue.project.href)} label={issue.project.title} leadingIcon={<IconBox size={12} stroke={1.5} />} className="max-w-[200px] shrink-0" />
        )}
        {issue.assignee && <Avatar name={issue.assignee.name} src={issue.assignee.picture} size={16} label={issue.assignee.name} />}
        {/* A fixed column, right-aligned, so the times stack down the list. */}
        <span className="w-16 shrink-0 text-right text-caption tabular-nums text-text-muted">{ago(issue.at)}</span>
      </span>
    </div>
  )
}
