import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's TextInput, verbatim minus its `signal:` focus ring (2026-08-26).
 * `@estiva/ui` candidate.
 *
 * Single-line text field — the shared form input used inside dialogs and
 * settings. Stretches to fill its container (place inside a `flex flex-col`,
 * e.g. `Field`). Font size uses explicit `text-[14px]` (not `text-body-2`) so
 * it survives tw-merge alongside `text-text-primary` — the pitfall Peek's
 * config records.
 */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, type = 'text', ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'rounded-lg border border-border-default bg-bg-inset px-3 py-2 focus:border-border-strong',
          'text-[14px] font-normal leading-[1.4] text-text-primary placeholder:text-text-muted',
          'outline-none transition-colors',
          'disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled',
          className,
        )}
        {...props}
      />
    )
  },
)
