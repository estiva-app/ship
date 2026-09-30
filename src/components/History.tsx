import { Avatar, EmptyState, WithTooltip } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'

/** One change, already in words: "set status to In Progress" (audit A2: never a wire value). */
export interface HistoryEntry {
  id: string
  by: { name?: string; picture?: string }
  /** Seconds. */
  at: number
  text: string
}

/**
 * An issue's history — its own change events, replayed as prose (Katerina,
 * 29 September): one line a change, the face, "Ravi Mehta set status to In
 * Progress", and when, muted at the end, with the date on hover. Newest first,
 * the same direction as the conversations above it. The words are the
 * caller's, built from the vocabulary's labels; a person is a face and a name.
 * History and conversation stay apart (REW-4).
 */
export function History({ entries, className }: { entries: HistoryEntry[]; className?: string }) {
  if (!entries.length) return <EmptyState scope="section" className={className} message="Nothing has changed yet." />
  const newestFirst = [...entries].sort((a, b) => b.at - a.at)
  return (
    <ol className={cn('flex flex-col', className)}>
      {newestFirst.map((entry) => (
        // One line a change; a long one wraps rather than being cut (production shows every word of a rename).
        <li key={entry.id} className="flex min-h-7 items-start gap-2 py-1 text-body-2">
          <Avatar name={entry.by.name} src={entry.by.picture} size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 text-text-secondary">
            <span className={cn('font-medium', entry.by.name ? 'text-text-primary' : 'text-text-muted')}>{entry.by.name ?? '—'}</span> {entry.text}
          </span>
          <WithTooltip label={new Date(entry.at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}>
            <span className="shrink-0 whitespace-nowrap pt-px text-caption text-text-muted">{ago(entry.at)}</span>
          </WithTooltip>
        </li>
      ))}
    </ol>
  )
}
