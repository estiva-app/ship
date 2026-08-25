import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's Button, ported (2026-08-25). `@estiva/ui` candidate (SHA-5) — every
 * button in Ship goes through this from now on (Katerina's ruling), so a
 * change of geometry is one edit.
 *
 * Same three variants and two sizes as Peek: 32px default / 24px small,
 * 6px radius, 500 weight; the primary reads inverse text on the accent, which
 * is what Peek's `signal:` theme does and is the only sensible reading on a
 * dark base. Sizes are spelled as arbitrary values for the reason Peek's
 * tailwind config records: tailwind-merge drops a custom `text-{size}` that
 * is followed by a `text-{colour}`.
 */
export type ButtonVariant = 'primary' | 'outlined' | 'muted'
export type ButtonSize = 'default' | 'small'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 16px, stroke 1.5 on the default size; 14px on small. */
  leadingIcon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'muted',
  size = 'default',
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const hasLeadingIcon = !!leadingIcon
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-md font-sans font-medium transition-colors',
        size === 'default' && 'h-8 text-[14px] leading-[14px]',
        size === 'small' && 'h-6 text-[12px] leading-[12px]',
        // Extra right padding beside a leading icon, for optical balance.
        size === 'default' && (hasLeadingIcon ? 'pl-2 pr-3' : 'px-2'),
        size === 'small' && (hasLeadingIcon ? 'pl-1.5 pr-2' : 'px-1.5'),
        !disabled && variant === 'primary' && 'cursor-pointer bg-accent-primary text-text-inverse hover:bg-accent-hover',
        !disabled && variant === 'outlined' && 'cursor-pointer border border-border-default text-text-primary hover:bg-bg-hover',
        !disabled && variant === 'muted' && 'cursor-pointer text-text-primary hover:bg-bg-hover',
        disabled && 'pointer-events-none bg-bg-disabled text-text-disabled',
        disabled && variant === 'outlined' && 'border border-border-default',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {leadingIcon}
      {children}
    </button>
  )
}
