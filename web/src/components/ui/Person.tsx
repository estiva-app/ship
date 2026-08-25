import { cn } from '@/lib/cn'
import { Avatar } from './Avatar'

/**
 * A face beside a name. `@estiva/ui` candidate — Peek's `Person` minus the
 * projection type it takes its profile from: this one is handed the two
 * strings and nothing else, so it cannot be handed a key. Same `gap-1.5` as
 * Peek's (Katerina, 2026-08-26 — "match Peek").
 *
 * A face beside a name needs no caption (Peek's rulings), and someone nobody
 * has published a name for gets the `fallback` — an em dash by default, the
 * same mark a property with no value uses — rather than the key back on
 * screen to say it. The header passes "Anonymous", because there the person
 * with no name is *you*, and you know who that is.
 *
 * Sizes in use: 16 on a card's "by" line, 20 in a row, 22 in the top bar's
 * trigger, 28 in the identity menu. The text size is the caller's, so the
 * face and the words are always set together — see the Sizes story.
 */
export interface PersonProps {
  name?: string
  picture?: string
  /** Shown in place of a missing name. */
  fallback?: string
  size?: number
  className?: string
}

export function Person({ name, picture, fallback = '—', size = 20, className }: PersonProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Avatar name={name} src={picture} size={size} />
      <span className={cn('truncate', !name && 'text-text-muted')}>{name ?? fallback}</span>
    </span>
  )
}
