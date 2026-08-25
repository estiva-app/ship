import { cn } from '@/lib/cn'
import { StatusIcon } from './StatusIcon'

/**
 * A status written out: its shaped icon and the vocabulary's label, in ONE
 * colour everywhere (Katerina, 2026-08-26: the card, the list and the table
 * had each picked their own). Ship-only, like StatusIcon.
 *
 * Two sizes: `small` (12px text, 14px icon) for a card's or a row's meta
 * line; `default` (14px text, 16px icon) for a table cell or a heading.
 * `strong` for a group or column heading, where the label names a group
 * rather than describing a thing — the weight changes, the colour does not.
 *
 * Sizes are arbitrary values because this string goes through cn(): a token
 * size before a colour class is dropped by tailwind-merge. small = caption,
 * default = body-2.
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
      <StatusIcon value={value} size={size === 'small' ? 14 : 16} />
      {label}
    </span>
  )
}
