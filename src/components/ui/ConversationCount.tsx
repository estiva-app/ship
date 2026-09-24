import { IconMessage2 } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/**
 * How much has been said about a file: a speech-bubble glyph and a number.
 *
 * Extracted from `IssueRow`, where the ruling on its place stands (Katerina,
 * 2026-09-09: the count before the chip — what is said about the file, then
 * where it lives). `ForeignObject` needed the same mark for a Related file's
 * conversation count, and the same class string twice is a component
 * (.claude/rules/ship-ui.md).
 *
 * The `unit` is the caller's, because the number is not always the same
 * thing: an issue row counts *conversations* (threads at the root), a foreign
 * file counts *comments* addressed to it, replies included. The glyph is the
 * same; the sentence a screen reader gets is not.
 *
 * Draws nothing at zero. A zero is a real answer on the wire — "nothing is
 * addressed to this file" — but a row of `0`s says less than their absence.
 * @registry reusable: stays in Ship (Katerina, 18 September)
 */
export function ConversationCount({ count, unit, className }: { count: number; unit: 'conversation' | 'comment'; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn('flex shrink-0 items-center gap-1 text-caption tabular-nums text-text-muted', className)}
      aria-label={`${count} ${count === 1 ? unit : `${unit}s`}`}
    >
      <IconMessage2 size={14} stroke={1.5} aria-hidden="true" />
      {count}
    </span>
  )
}
