import { ProgressBar } from '@estiva-app/ui'
import { cn } from '@/lib/cn'

/** A project's issues done of all as a bar with "6 / 10" beside it; the bar alone leaves a phone's row in a table. */
export function ProjectProgress({ done, total, archived = false, wide = false }: { done: number; total: number; archived?: boolean; wide?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-2', wide ? 'w-full' : 'sm:w-36')}>
      <ProgressBar value={done} max={total} label="Issues done" variant={archived ? 'quiet' : 'default'} className={wide ? 'flex-1' : 'hidden flex-1 sm:block'} />
      <span className="w-12 text-right font-mono text-caption tabular-nums text-text-secondary">
        {done} / {total}
      </span>
    </span>
  )
}
