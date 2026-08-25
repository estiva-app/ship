import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's SearchInput, ported (2026-08-25), rendered the way Peek's Signal
 * theme renders it but on Ship's tokens (Katerina, 2026-08-26): the field is
 * an inset panel with a hairline border that strengthens on focus, and the
 * keyboard hint is Signal's `kbd` chip — mono, 10px, a faint fill (the
 * `bg-hover` translucency), a thicker bottom edge. `@estiva/ui` candidate —
 * the one thing Ship adds is its own placeholder.
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
        <kbd className="shrink-0 whitespace-nowrap rounded-sm border border-b-2 border-border-default bg-bg-hover px-1 py-0.5 font-mono text-[10px] leading-[1.2] text-text-secondary">
          {shortcut}
        </kbd>
      )}
    </div>
  )
}
