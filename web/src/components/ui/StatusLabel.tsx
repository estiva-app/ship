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
 * small = caption, default = body-2, as the type tokens (S6, 0.10.0): the
 * package's cn() names the ramp for tailwind-merge, so a token size beside a
 * colour class survives, which is why these were arbitrary values before.
 *
 * The shape stands alone in ONE place — `StatusShape`, on the Issues page's
 * list row (Katerina, 2026-09-09, Linear's row as the picture) — because
 * that list is grouped by status and the group heading already says the
 * word; a shape without its word anywhere else is a dot, and dots were what
 * the shapes replaced. It names itself for a reader who cannot see it.
 */
export interface StatusLabelProps {
  /** The raw status value — decides the icon. */
  value: string
  /** The vocabulary's label — or the raw value, when it has none. */
  label: string
  /**
   * Another app's status, by the colour its manifest declared — UIG-18.
   *
   * **Use this for every object Ship does not own.** What the projection hands
   * a consumer is the vocabulary's *label*, never the raw value (interop
   * `projection.js`: `value = entry?.label ?? raw`), so `value` above cannot
   * match and every foreign status fell to the plain circle — Ship's own
   * issues included, the moment one was mentioned in a comment. The colour is
   * the one signal of *meaning* that does cross an app boundary, and it is
   * declared for exactly that: "set when the value came from a vocabulary —
   * the consumer picks the colour".
   *
   * Ship's own vocabulary uses the same four (`kinds.ts`), so a Ship object
   * read back through the projection gets the shape it has natively.
   */
  colour?: string
  size?: 'small' | 'default'
  strong?: boolean
  className?: string
}

/**
 * An issue's status as its shape alone, named for screen readers — for the
 * Issues list row only; `StatusLabel` writes the name out.
 */
export function StatusShape({ value, label, size = 16, className }: { value: string; label: string; size?: 14 | 16; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn('flex shrink-0', className)}>
      <Shape value={value} size={size} />
    </span>
  )
}

/** A declared colour, as the shape that means the same thing. `stage` never reaches a consumer, so this is the crossing. */
const BY_COLOUR: Record<string, string> = {
  neutral: 'todo',
  blue: 'in_progress',
  green: 'done',
  muted: 'cancelled',
}

function Shape({ value, colour, size }: { value: string; colour?: string; size: 14 | 16 }) {
  const common = { size, stroke: 1.5, className: 'shrink-0' }
  switch (colour ? (BY_COLOUR[colour] ?? '') : value) {
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

/**
 * An issue's or project's status written out: its icon, such as a dashed circle
 * for Todo or a tick for Done, and its name.
 * @registry reusable: stays in Ship (Katerina, 18 September)
 */
export function StatusLabel({ value, label, colour, size = 'default', strong = false, className }: StatusLabelProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-text-secondary',
        size === 'small' ? 'text-caption' : 'text-body-2',
        strong && 'font-medium',
        className,
      )}
    >
      <Shape value={value} colour={colour} size={size === 'small' ? 14 : 16} />
      {label}
    </span>
  )
}
