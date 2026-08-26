import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Chip } from './Chip'

/**
 * Peek's TopicTabs, ported with the topic-specific ids taken out (ruling B8:
 * "use Peek's Tabs component so it is shared"). `@estiva-app/ui` candidate.
 *
 * A selected tab is a neutral fill (bg-active), not the accent tint
 * (Katerina, 2026-08-27). Two sizes. `default` is Ship's — 14px (`text-body-2`), a little more room —
 * because Peek's 12px read too small on the projects list (Katerina,
 * 2026-08-26). `small` is Peek's own geometry, kept so the shared component
 * still renders Peek unchanged. Both on tokens: Peek's inline
 * `fontSize: 12` was the `caption` token spelled by hand.
 *
 * A tab's count is a Chip beside the label, not part of the label text
 * ("Active" + [5], never "Active (5)") — Katerina, 2026-08-26. On the active
 * tab the chip sits on the accent tint, where a neutral chip (bg-inset)
 * vanished; it takes white at 15% there instead (Katerina, 2026-08-27:
 * "white with opacity" — bg-active's 8% read as grey).
 */
export interface TabDef<T extends string> {
  id: T
  label: string
  /** Shown in a chip after the label. Absent or 0 draws no chip. */
  count?: number
  icon?: ReactNode
}

export interface TabsProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  /** `default` 14px (Ship); `small` 12px (Peek's TopicTabs as it ships). */
  size?: 'default' | 'small'
  className?: string
}

export function Tabs<T extends string>({ tabs, active, onChange, size = 'default', className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex items-center gap-2', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 transition-colors',
            size === 'default' ? 'rounded-md px-2 py-1 text-body-2' : 'rounded px-1.5 py-0.5 text-caption',
            active === tab.id ? 'bg-bg-active text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined ? <Chip label={String(tab.count)} className={active === tab.id ? 'bg-white/15' : undefined} /> : null}
        </button>
      ))}
    </div>
  )
}
