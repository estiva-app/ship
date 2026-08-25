import type { ReactNode } from 'react'

/**
 * Peek's Property, ported (2026-08-26). `@estiva/ui` candidate.
 *
 * A labelled property row — "Status", "Lead", and whatever else a page
 * declares — for a detail rail. The 68px label column is what lines the
 * values up into a column of their own; `text-secondary` rather than muted
 * because a property label is content, not a placeholder. Peek's `text-xs`
 * is the `caption` token here, per the rule that everything sits on a token.
 */
export function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-caption text-text-secondary">{label}</span>
      {children}
    </div>
  )
}
