import { cn } from '@/lib/cn'

/**
 * Peek's Divider, verbatim, plus one thing Peek does not have yet and the
 * shared package should: `orientation="vertical"` — the same hairline
 * standing up, stretching to its row's height, no inset. Ship's project and
 * issue pages put it between the scrolling content and the rail (Katerina,
 * 2026-08-27). `@estiva/ui` candidate.
 */
export interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Divider({ orientation = 'horizontal', className }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-border-subtle', orientation === 'horizontal' ? 'mx-3 h-px' : 'w-px self-stretch', className)}
    />
  )
}
