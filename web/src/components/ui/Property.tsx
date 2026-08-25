import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SectionLabel } from './SectionLabel'

/**
 * Peek's Property, ported (2026-08-26). `@estiva/ui` candidate.
 *
 * A labelled property row — "Status", "Lead", and whatever else a page
 * declares. Two layouts, one component (one component, not two that drift):
 *
 * - `row` — Peek's, verbatim: a 68px label column that lines the values up
 *   into a column of their own; `text-secondary` rather than muted because a
 *   property label is content, not a placeholder. Peek's `text-xs` is the
 *   `caption` token here.
 * - `stacked` — Ship's rail, as production has it: the label above a
 *   full-width control, the label a `SectionLabel` set uppercase and
 *   letter-spaced as production's rail labels are and as Peek's Signal theme
 *   renders every SectionLabel (Katerina, 2026-08-26: "we have the section
 *   label for that … I like that it's uppercase"). Right for a 250px rail
 *   where the control wants the whole width.
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
        <SectionLabel className="uppercase tracking-[0.08em] text-text-secondary">{label}</SectionLabel>
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
