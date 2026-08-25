import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { WithTooltip } from './Tooltip'

/**
 * Peek's IconButton, verbatim (2026-08-26). `@estiva/ui` candidate.
 *
 * Icon-only, so it needs an accessible name: pass `aria-label`, and usually
 * `tooltip` with the same words so a pointer gets what a screen reader gets.
 * The icon inside is 16px stroke 1.5 on the default control, 14 on a small one.
 */
export type IconButtonVariant = 'muted' | 'outlined' | 'primary'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant
  tooltip?: string
  tooltipPlacement?: 'top' | 'bottom'
  children: ReactNode
}

export function IconButton({
  variant = 'muted',
  className,
  children,
  disabled,
  tooltip,
  tooltipPlacement,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      className={cn(
        'flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1 transition-colors',
        !disabled && variant === 'primary' && 'bg-accent-primary text-text-inverse hover:bg-accent-hover',
        !disabled && variant === 'muted' && 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        !disabled && variant === 'outlined' && 'border border-border-default text-text-secondary hover:bg-bg-hover',
        disabled && variant === 'primary' && 'bg-bg-disabled text-text-disabled',
        disabled && variant === 'muted' && 'text-text-disabled',
        disabled && variant === 'outlined' && 'border border-border-default text-text-disabled',
        disabled && 'pointer-events-none cursor-not-allowed',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )

  if (tooltip) {
    return (
      <WithTooltip label={tooltip} placement={tooltipPlacement}>
        {button}
      </WithTooltip>
    )
  }
  return button
}
