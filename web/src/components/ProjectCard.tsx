import { Card } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { linkTo } from '@/router'

/**
 * One project on the projects list — her anatomy (ruling B7): title ·
 * description clamped to — and always as tall as — two lines · a line reading *status · N issues ·
 * x/y done* with a shaped status icon before the word · a last line
 * *by · face · name · 1d ago*. Archived ones carry an "Archived" chip (B8).
 * The two meta lines breathe a little more than the rest (`gap-2.5`;
 * Katerina, 2026-08-26).
 *
 * Counts are honest: an empty project shows no issue counter at all rather
 * than "0 issues · 0/0 done" (Peek's counts rule), so its line is just the
 * status. The status word is the vocabulary's label, exactly as production
 * prints it (`lookupStatus`) — never a renamed one. The author is a face and
 * a name — never a key — resolved by the caller from `kind:0`; nobody has
 * published one for most keys, and then the face is a silhouette and the
 * name an em dash. The time is the old app's `ago()`, as in production.
 *
 * Geometry follows today's card: a surface panel with a hairline border that
 * brightens on hover. The whole card is the link.
 */
export interface ProjectCardProps {
  href: string
  title: string
  description?: string
  /** The raw value and the label the vocabulary gives it (`lookupStatus`). */
  status: { value: string; label: string }
  issueCount: number
  doneCount: number
  author: { name?: string; picture?: string }
  /** Seconds, as the relay keeps them. */
  createdAt: number
  archived?: boolean
  className?: string
}

export function ProjectCard({
  href,
  title,
  description,
  status,
  issueCount,
  doneCount,
  author,
  createdAt,
  archived = false,
  className,
}: ProjectCardProps) {
  return (
    <Card {...linkTo(href)} fill="surface" className={cn('flex flex-col gap-2 p-3', className)}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-body-2-strong text-text-primary">{title}</span>
        {archived && <Chip label="Archived" />}
      </div>
      {/* Always two lines tall, even with one line or none, so the status line and
          the by-line sit at the same height on every card in the grid (Katerina,
          2026-08-26). */}
      <p className="mb-1 line-clamp-2 min-h-[2lh] text-body-2 text-text-secondary">{description}</p>
      <div className="flex items-center gap-2.5 text-caption text-text-muted">
        <StatusLabel value={status.value} label={status.label} size="small" />
        {issueCount > 0 && (
          <>
            <Dot />
            <span>
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
            </span>
            <Dot />
            <span className="tabular-nums">
              {doneCount}/{issueCount} done
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2.5 text-caption text-text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <span>by</span>
          <Avatar name={author.name} src={author.picture} size={16} />
          <span className={cn('truncate', author.name ? 'text-text-secondary' : 'text-text-muted')}>
            {author.name ?? '—'}
          </span>
        </span>
        <Dot />
        <span className="shrink-0">{ago(createdAt)}</span>
      </div>
    </Card>
  )
}

function Dot() {
  return <span aria-hidden="true">·</span>
}
