import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Peek's Chip, ported minus its `signal:` glows. `@estiva/ui` candidate. */
export type ChipType = 'neutral' | 'brand' | 'info' | 'warning' | 'success' | 'error'

export interface ChipProps {
  type?: ChipType
  label?: string
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  className?: string
}

const typeStyles: Record<ChipType, string> = {
  neutral: 'bg-bg-inset text-text-primary',
  brand: 'bg-accent-muted text-accent-primary',
  info: 'bg-info-muted text-info-default',
  warning: 'bg-warning-muted text-warning-default',
  success: 'bg-success-muted text-success-default',
  error: 'bg-error-muted text-error-default',
}

export function Chip({ type = 'neutral', label, leadingIcon, trailingIcon, className }: ChipProps) {
  return (
    <div
      className={cn(
        'inline-flex max-h-[20px] min-w-[16px] items-center justify-center gap-1.5 rounded-full px-2 py-1',
        typeStyles[type],
        className,
      )}
    >
      {leadingIcon && <span className="size-3 shrink-0">{leadingIcon}</span>}
      {label && <span className="whitespace-nowrap text-chip">{label}</span>}
      {trailingIcon && <span className="size-3 shrink-0">{trailingIcon}</span>}
    </div>
  )
}
