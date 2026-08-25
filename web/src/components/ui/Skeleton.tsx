import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's Skeleton, the generic parts (2026-08-26). `@estiva/ui` candidate.
 *
 * Shapes are bg-inset with the small radius; wrap a group in
 * `animate-skeleton-in` (see SkeletonList) so skeletons only appear after a
 * 150ms delay — fast loads never flash one (Peek's rule, 2026-07-08).
 *
 * Peek's file also carries placeholders shaped like its conversation cards
 * and huddle cards. Those know what a huddle is and stay in Peek; Ship's own
 * shapes (an issue row, a project card) come with the surfaces that need them.
 */
export function SkeletonBar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('animate-pulse rounded-sm bg-bg-inset', className)} style={style} />
}

/** Varied text-bar widths so lists read as content, not stripes. */
const ROW_BAR_WIDTHS = [150, 100, 170, 120, 90, 140, 110, 160]

/** List-row placeholder — a 32px row with a 16px icon and a text bar. */
export function SkeletonRow({ barWidth = 130 }: { barWidth?: number }) {
  return (
    <div className="flex h-[32px] items-center gap-2 rounded-lg px-2">
      <SkeletonBar className="h-4 w-4 shrink-0" />
      <SkeletonBar className="h-3.5" style={{ width: barWidth }} />
    </div>
  )
}

/** A list of skeleton rows, revealed only after the 150ms delay. */
export function SkeletonList({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5 animate-skeleton-in', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} barWidth={ROW_BAR_WIDTHS[i % ROW_BAR_WIDTHS.length]} />
      ))}
    </div>
  )
}
