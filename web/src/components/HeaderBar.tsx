import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The header: the app's name on the left, identity on the right. That is the
 * whole of it — today's header is a title and a profile menu, and stays so.
 *
 * The identity slot takes an `IdentityMenu`; this component does not know who
 * you are, only where that goes.
 */
export interface HeaderBarProps {
  identity: ReactNode
  className?: string
}

export function HeaderBar({ identity, className }: HeaderBarProps) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between border-b border-border-default bg-bg-surface pl-4 pr-2',
        className,
      )}
    >
      <span className="text-body-2-strong text-text-primary">Estiva Ship</span>
      {identity}
    </header>
  )
}
