import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * An issue's history: the folded change events replayed as prose — who did
 * what, when. The words are the caller's, built from the vocabulary's labels
 * (audit A2: never a wire value like `in_progress` in a sentence); people
 * are faces and names, never keys. The time sits under the entry, relative
 * (Peek's history ruling). Ship-only.
 */
export interface ActivityEntry {
  id: string
  by: { name?: string; picture?: string }
  /** Seconds. */
  at: number
  /** Already in words: "set status to In Progress". */
  text: string
}

export function ActivityFeed({ entries, className }: { entries: ActivityEntry[]; className?: string }) {
  if (!entries.length) return <EmptyState className={cn('py-6', className)} message="Nothing has changed yet." />
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-2">
          <Avatar name={entry.by.name} src={entry.by.picture} size={18} className="mt-px" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-2 text-text-secondary">
              <span className={cn('font-medium', entry.by.name ? 'text-text-primary' : 'text-text-muted')}>{entry.by.name ?? '—'}</span> {entry.text}
            </span>
            <span className="text-caption text-text-muted">{ago(entry.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
