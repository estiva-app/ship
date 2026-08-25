import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { WithTooltip } from '@/components/ui/Tooltip'

/**
 * One row of the sidebar: a label, an optional count, an active state.
 *
 * The count is a number of OPEN issues and nothing else (ruling A2) — the
 * tooltip says so ("18 open"), and a zero is not drawn at all. Today's app
 * counts open issues on one row and every issue on the next, and says
 * nothing about which; this component cannot express that difference, so
 * the caller has to pass the right number.
 *
 * Active is a quiet selected background with the text left primary (ruling
 * A3), not the accent-coloured bold of the old app.
 */
export interface NavItemProps {
  label: string
  href: string
  /** Open issues. `0` or absent renders no counter (Peek's counts rule). */
  count?: number
  active?: boolean
  /** 16px, stroke 1.5. The two fixed entries have none today; kept optional. */
  icon?: ReactNode
  className?: string
}

export function NavItem({ label, href, count, active = false, icon, className }: NavItemProps) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-body-2 transition-colors',
        active ? 'bg-bg-selected text-text-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        className,
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {count ? (
        <WithTooltip label={`${count} open`}>
          <span className="shrink-0 text-caption tabular-nums text-text-muted">{count}</span>
        </WithTooltip>
      ) : null}
    </a>
  )
}
