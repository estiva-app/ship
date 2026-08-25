import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The top bar, in Peek's shape and at Peek's geometry: 52px tall, `pl-5
 * pr-[26px]` (Katerina, 2026-08-26 — "52 like Peek"), something on the left,
 * a search slot in the middle, the identity on the right. Today Ship's left
 * is its name and the middle is empty — the search field (and the launcher
 * it opens) is a later piece, and the slot is here so it drops in without
 * moving anything.
 *
 * This component does not know who you are or what is being searched; it
 * only knows where those go.
 */
export interface TopBarProps {
  /** The left-hand side. Ship's name by default. */
  title?: ReactNode
  /** The centre: a search field, when there is one. */
  search?: ReactNode
  /** The right-hand side — an `IdentityMenu`. */
  right: ReactNode
  className?: string
}

export function TopBar({ title = 'Estiva Ship', search, right, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'flex h-[52px] shrink-0 items-center gap-4 border-b border-border-default bg-bg-surface pl-5 pr-[26px]',
        className,
      )}
    >
      <div className="flex shrink-0 items-center text-body-2-strong text-text-primary">{title}</div>
      <div className="flex min-w-0 flex-1 items-center justify-center">{search}</div>
      <div className="flex shrink-0 items-center gap-[6px]">{right}</div>
    </header>
  )
}
