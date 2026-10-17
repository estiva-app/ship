import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { WithTooltip } from '@/components/ui/Tooltip'

/**
 * A file's summary as a board card and a project card draw it: its own muted line under the title, cut at `lines`.
 * The issue row and the table drew it too, as one line, and now carry it as the title's hover (Miky, SUM-9, 17 Oct).
 *
 * The rules are the short-summary prototype's (estiva-ui `concept/short-summary`,
 * approved by Miky 15 Oct; record a-files-summary-is-its-own-field):
 * - its own line under the title, never the description cut short;
 * - one line in a row and the table, two on a board card and a project card —
 *   SPEC §6.12 asks every reader to clamp it, and a CSS clamp is enough;
 * - no summary, no line: the caller's row keeps today's height;
 * - literal text: no markdown, no links. React draws a string as text, so
 *   `**this**` or a URL reads exactly as it was typed.
 *
 * A span, not a paragraph, because three of the four places sit inside a link.
 */
/** A file's summary as the tooltip on what `children` draws — the issue row and the table's title. None or blank: `children` alone. */
export function WithSummary({ summary, wrapperClassName, children }: { summary?: string; wrapperClassName?: string; children: ReactNode }) {
  if (!summary?.trim()) return <>{children}</>
  return (
    <WithTooltip label={summary} wrapperClassName={wrapperClassName}>
      {children}
    </WithTooltip>
  )
}

export function SummaryLine({ summary, lines, className }: { summary?: string; lines: 1 | 2; className?: string }) {
  if (!summary) return null
  return <span className={cn('block text-text-secondary', lines === 1 ? 'truncate' : 'line-clamp-2', className)}>{summary}</span>
}
