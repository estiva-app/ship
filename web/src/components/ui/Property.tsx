import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's Property, ported (2026-08-26). `@estiva-app/ui` candidate.
 *
 * A labelled property row — "Status", "Lead", and whatever else a page
 * declares. Two layouts, one component (one component, not two that drift):
 *
 * - `row` — Peek's, verbatim: a 68px label column that lines the values up
 *   into a column of their own; `text-secondary` rather than muted because a
 *   property label is content, not a placeholder. Peek's `text-xs` is the
 *   `caption` token here.
 * - `stacked` — Ship's rail, as production has it: the label above a
 *   full-width control. The label is the `menu` token (9px / 115% / 500),
 *   uppercase and letter-spaced, in `text-secondary` (Katerina, 2026-08-26:
 *   "smaller and uppercase … we have a token for it, 9px"). Its className is
 *   a literal string, not merged, so `text-menu` is not dropped beside the
 *   colour class (the tailwind-merge pitfall).
 */
export interface PropertyProps {
  label: string
  layout?: 'row' | 'stacked'
  children: ReactNode
  className?: string
}

export function Property({ label, layout = 'row', children, className }: PropertyProps) {
  if (layout === 'stacked') {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <span className="text-menu uppercase tracking-[0.08em] text-text-secondary">{label}</span>
        {children}
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-[68px] shrink-0 text-caption text-text-secondary">{label}</span>
      {children}
    </div>
  )
}
