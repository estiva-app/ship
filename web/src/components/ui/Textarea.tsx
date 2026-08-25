import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's Textarea, verbatim minus its `signal:` focus ring (2026-08-26).
 * `@estiva/ui` candidate.
 *
 * Multi-line text field — the shared form textarea (a description, a
 * resolution message). Non-resizable by default; pass a height via
 * `className` (e.g. `h-[109px]`). Font size uses explicit `text-[14px]` so it
 * survives tw-merge alongside `text-text-primary`.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'rounded-lg border border-border-default bg-bg-inset px-3 py-2 focus:border-border-strong',
          'text-[14px] font-normal leading-[1.4] text-text-primary placeholder:text-text-muted',
          'resize-none outline-none transition-colors',
          'disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled',
          className,
        )}
        {...props}
      />
    )
  },
)
