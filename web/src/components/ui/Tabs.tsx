import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Peek's TopicTabs, ported with the topic-specific ids taken out (ruling B8:
 * "use Peek's Tabs component so it is shared"). Same rows, same 12px text,
 * same selected fill. `@estiva/ui` candidate.
 */
export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

export interface TabsProps<T extends string> {
  tabs: TabDef<T>[]
  active: T
  onChange: (id: T) => void
  className?: string
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
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
            'flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
            active === tab.id ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
          )}
          style={{ fontSize: 12, lineHeight: '120%', fontWeight: 400 }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
