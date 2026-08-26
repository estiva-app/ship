import { IconCircle, IconCircleCheck, IconCircleDashed, IconCircleHalf2, IconCircleX } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/**
 * A status written out: its shaped icon and the vocabulary's label, in ONE
 * colour everywhere (Katerina, 2026-08-26: the card, the list and the table
 * had each picked their own). Ship-only: it knows Ship's vocabulary.
 *
 * The shapes (ruling C14, Tabler): an open thing is `circle-dashed` (Peek's
 * unresolved topic), in progress `circle-half-2` in the info colour, done
 * `circle-check` in the success colour (Peek's resolved), cancelled
 * `circle-x` muted. A status the vocabulary does not know is a plain circle,
 * shown rather than hidden — another app wrote it and it is still true.
 * Issues and projects share the shapes: todo = planned, done = completed.
 *
 * Two sizes: `small` (12px text, 14px icon) for a card's or a row's meta
 * line; `default` (14px text, 16px icon) for a table cell or a heading.
 * `strong` for a group or column heading, where the label names a group
 * rather than describing a thing — the weight changes, the colour does not.
 *
 * Sizes are arbitrary values because this string goes through cn(): a token
 * size before a colour class is dropped by tailwind-merge. small = caption,
 * default = body-2. There is deliberately no icon-only export: a status
 * without its word is a dot, and dots were what the shapes replaced.
 */
export interface StatusLabelProps {
  /** The raw status value — decides the icon. */
  value: string
  /** The vocabulary's label — or the raw value, when it has none. */
  label: string
  size?: 'small' | 'default'
  strong?: boolean
  className?: string
}

function StatusShape({ value, size }: { value: string; size: 14 | 16 }) {
  const common = { size, stroke: 1.5, className: 'shrink-0' }
  switch (value) {
    case 'todo':
    case 'planned':
      return <IconCircleDashed {...common} className={cn(common.className, 'text-text-secondary')} />
    case 'in_progress':
      return <IconCircleHalf2 {...common} className={cn(common.className, 'text-info-default')} />
    case 'done':
    case 'completed':
      return <IconCircleCheck {...common} className={cn(common.className, 'text-success-default')} />
    case 'cancelled':
      return <IconCircleX {...common} className={cn(common.className, 'text-text-muted')} />
    default:
      return <IconCircle {...common} className={cn(common.className, 'text-text-muted')} />
  }
}

export function StatusLabel({ value, label, size = 'default', strong = false, className }: StatusLabelProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-text-secondary',
        size === 'small' ? 'text-[12px] leading-[120%]' : 'text-[14px] leading-[140%]',
        strong && 'font-medium',
        className,
      )}
    >
      <StatusShape value={value} size={size === 'small' ? 14 : 16} />
      {label}
    </span>
  )
}
