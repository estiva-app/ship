import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's SearchInput, ported (2026-08-25) minus its `signal:` variants.
 * `@estiva/ui` candidate — the one thing Ship adds is its own placeholder.
 *
 * In Peek's TopBar this is a launcher affordance rather than a live field:
 * clicking it opens the command launcher. Ship will decide what its search
 * opens when it has one; the component is the same either way.
 */
export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** A keyboard hint drawn at the right edge, e.g. "⌘ K". */
  shortcut?: string
  className?: string
}

export function SearchInput({ shortcut, className, placeholder = 'Search…', ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2',
        'border border-border-default bg-bg-inset',
        'transition-colors focus-within:border-border-strong',
        className,
      )}
    >
      <input
        className="min-w-0 flex-1 bg-transparent text-input-value text-text-primary outline-none placeholder:text-text-muted"
        placeholder={placeholder}
        {...props}
      />
      {shortcut && (
        <div className="flex shrink-0 items-center justify-center rounded-sm border border-border-strong bg-bg-inset px-1 py-px">
          <span className="whitespace-nowrap text-caption text-text-secondary">{shortcut}</span>
        </div>
      )}
    </div>
  )
}
