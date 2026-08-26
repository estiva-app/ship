import type { ButtonHTMLAttributes } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { Person, type PersonProps } from './Person'

/**
 * A `Person` that opens something: face · name · chevron, as one control.
 * `@estiva-app/ui` candidate (Katerina, 2026-08-25) — Peek has no equivalent yet;
 * its TopBar uses a bare avatar as the trigger.
 *
 * The chevron is 14px, the small-control size; the row is a 32px button like
 * every other button here.
 */
export interface PersonTriggerProps
  extends Omit<PersonProps, 'className'>,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Whether what it opens is open — the trigger holds its hover fill while so. */
  open?: boolean
}

export function PersonTrigger({ name, picture, fallback, size = 22, open = false, className, ...props }: PersonTriggerProps) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-1.5 rounded-md pl-1.5 pr-1.5 text-body-2 text-text-primary transition-colors hover:bg-bg-hover',
        open && 'bg-bg-hover',
        className,
      )}
      {...props}
    >
      <Person name={name} picture={picture} fallback={fallback} size={size} />
      <IconChevronDown size={14} stroke={1.5} className="shrink-0 text-text-muted" />
    </button>
  )
}
