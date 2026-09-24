/**
 * Ship's `cn` is the shared one (2026-09-01) — the same clsx + tailwind-merge
 * body this file carried as a verbatim copy of Peek's, now imported instead.
 *
 * The caveat still stands: `tailwind-merge` silently drops a custom
 * `text-{size}` token that is followed by a `text-{colour}` class, so shared
 * components spell sizes as arbitrary values.
 */
export { cn } from '@estiva-app/ui'
