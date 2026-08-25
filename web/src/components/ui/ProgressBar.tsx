import { cn } from '@/lib/cn'

/**
 * A progress bar: a thin inset track with a success-coloured fill, as
 * production's rail draws a project's progress. `@estiva/ui` candidate —
 * nothing here knows what is being counted; Peek has no bar yet and would
 * use this one.
 *
 * The bar alone says nothing a screen reader can use, so it carries the
 * ARIA progress role with its numbers; the caller prints the words beside it
 * ("10 of 14 done"), which is what a person reads.
 */
export interface ProgressBarProps {
  value: number
  max: number
  /** The accessible name — "Issues done". */
  label: string
  className?: string
}

export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-bg-inset', className)}
    >
      <div className="h-full rounded-full bg-success-default transition-[width]" style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}
