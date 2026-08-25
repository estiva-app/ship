import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * THE section-heading label — Peek's `SectionLabel`, ported (2026-08-25).
 * Every section title in the app renders through this span so a style change
 * is one edit: 12px / 12px / 500, primary text (Peek's ruling 2026-07-23:
 * labels stay primary). `@estiva/ui` candidate.
 *
 * Written as arbitrary values rather than `text-h5` for the tailwind-merge
 * reason Peek's config records.
 */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[12px] font-medium leading-[12px] text-text-primary', className)}>
      {children}
    </span>
  )
}
