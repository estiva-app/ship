import type { ReactNode } from 'react'
import { IconMessage2 } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/** Peek's EmptyState, verbatim but for the default message. `@estiva/ui` candidate. */
export interface EmptyStateProps {
  icon?: ReactNode
  message: string
  className?: string
}

export function EmptyState({ icon, message, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <span className="text-text-secondary">{icon ?? <IconMessage2 size={16} stroke={1.5} />}</span>
      <p className="text-center text-body-2 text-text-secondary">{message}</p>
    </div>
  )
}
