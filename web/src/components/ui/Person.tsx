import { cn } from '@/lib/cn'
import { Avatar } from './Avatar'

/**
 * A face beside a name. `@estiva/ui` candidate — Peek's `Person` minus the
 * projection type it takes its profile from: this one is handed the two
 * strings and nothing else, so it cannot be handed a key.
 *
 * A face beside a name needs no caption (Peek's rulings), and someone nobody
 * has published a name for gets the `fallback` — an em dash by default, the
 * same mark a property with no value uses — rather than the key back on
 * screen to say it. The header passes "Anonymous", because there the person
 * with no name is *you*, and you know who that is.
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
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <Avatar name={name} src={picture} size={size} />
      <span className={cn('truncate', !name && 'text-text-muted')}>{name ?? fallback}</span>
    </span>
  )
}
