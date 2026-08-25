import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { WithTooltip } from '@/components/ui/Tooltip'

/**
 * One row of the sidebar: a label, an optional count, an active state.
 *
 * A count is a number of ONE thing, and its tooltip says which (ruling A2):
 * the issue rows count open issues ("18 open"); the Projects entry counts
 * active projects ("5 active" — Katerina, 2026-08-26, restoring today's
 * count). Today's app shows both numbers and says nothing about either;
 * here the caller passes the number and the words for it, and a zero is not
 * drawn at all.
 *
 * Active is the same fill as a selected tab — the accent tint — with the text
 * left primary (rulings A3 and, 2026-08-27, "same as the selected tab").
 */
export interface NavItemProps {
  label: string
  href: string
  /** `0` or absent renders no counter (Peek's counts rule). */
  count?: number
  /** What the count counts, for the tooltip — "18 open", "5 active". */
  countLabel?: string
  active?: boolean
  /** 16px, stroke 1.5. */
  icon?: ReactNode
  className?: string
}

export function NavItem({ label, href, count, countLabel, active = false, icon, className }: NavItemProps) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-body-2 transition-colors',
        active ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        className,
      )}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {count ? (
        <WithTooltip label={countLabel ?? `${count} open`}>
          <span className="shrink-0 font-mono text-caption tabular-nums text-text-muted">{count}</span>
        </WithTooltip>
      ) : null}
    </a>
  )
}
