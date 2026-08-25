import { cn } from '@/lib/cn'

/** Peek's Divider, verbatim. `@estiva/ui` candidate. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn('mx-3 h-px bg-border-subtle', className)} />
}
