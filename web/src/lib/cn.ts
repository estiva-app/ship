import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, last-one-wins on conflicting Tailwind utilities.
 *
 * Peek's `@/lib/utils` verbatim (same three dependencies, same versions), so a
 * component moved into `@estiva/ui` at SHA-5 needs no edit here. Note the
 * caveat Peek's tailwind config records: `tailwind-merge` silently drops a
 * custom `text-{size}` token that is followed by a `text-{colour}` class, so
 * shared components spell sizes as arbitrary values.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
