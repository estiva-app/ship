import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { SectionLabel } from './SectionLabel'

/**
 * THE menu shell — Peek's, extracted (2026-08-25). `@estiva/ui` candidate,
 * for every menu in every app.
 *
 * Peek has no single Menu file; TopicMoreMenu, ConversationMoreMenu and the
 * TopBar's account menu each hand-roll the same thing, and the point of this
 * file is that Ship does not become the fourth copy. What they share, kept
 * exactly: an elevated container with a hairline border, 8px radius, 8px
 * padding and the large shadow; items that are 8px-radius rows, `px-2 py-1.5`,
 * hover fill, 14px text, destructive ones in the error colour; section
 * headings as a SectionLabel in a 32px row; Divider between groups; and the
 * two exits every menu has — Escape and a click outside — owned by the menu,
 * not copied into each caller (TopicMoreMenu's note on why).
 *
 * Two anchorings: `position` portals it to the body at fixed viewport
 * coordinates (Peek's way, for menus opened inside scrolling containers that
 * clip); without it the menu hangs below its trigger, right-aligned, and the
 * caller's wrapper is `relative`.
 */
export interface MenuProps {
  onClose: () => void
  /** Viewport coordinates; the menu is portalled and right-aligned to them. */
  position?: { top: number; right: number }
  children: ReactNode
  className?: string
}

export function Menu({ onClose, position, children, className }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const style: CSSProperties | undefined = position ? { top: position.top, right: position.right } : undefined
  const node = (
    <div
      ref={ref}
      role="menu"
      data-interactive
      className={cn(
        'z-50 flex min-w-[180px] flex-col rounded-lg border border-border-default bg-bg-elevated p-2 shadow-lg',
        position ? 'fixed' : 'absolute right-0 top-full mt-1',
        className,
      )}
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
  return position ? createPortal(node, document.body) : node
}

export interface MenuItemProps {
  label: string
  onClick?: () => void
  /** 16px, stroke 1.5, secondary — as Peek draws them. */
  icon?: ReactNode
  shortcut?: string
  destructive?: boolean
  /** The row the menu currently points at (a submenu's chosen value). */
  selected?: boolean
}

export function MenuItem({ label, onClick, icon, shortcut, destructive, selected }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-hover',
        selected && 'bg-bg-hover',
      )}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className={cn('flex-1 truncate text-sm', destructive ? 'text-error-default' : 'text-text-primary')}>
        {label}
      </span>
      {shortcut && (
        <kbd className="inline-flex shrink-0 items-center justify-center rounded-sm border border-border-strong bg-bg-inset px-1 py-px text-caption text-text-secondary">
          {shortcut}
        </kbd>
      )}
    </button>
  )
}

/** A section heading inside a menu: Peek's 32px row with a SectionLabel. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex h-8 items-center px-2">
        <SectionLabel>{label}</SectionLabel>
      </div>
      {children}
    </div>
  )
}

/** A non-interactive row inside a menu, at the item's own geometry. */
export function MenuRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-2 px-2 py-1.5', className)}>{children}</div>
}
