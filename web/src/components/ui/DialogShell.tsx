import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'

/**
 * Peek's DialogShell, verbatim (2026-08-26) plus the Escape key, which Peek
 * leaves to each dialog "by convention" and Ship owns here so no dialog can
 * forget it. `@estiva/ui` candidate.
 *
 * The reusable dialog scaffold: portal + backdrop + centred card with a fixed
 * header (title + close) and footer, and a body slot in between. Every
 * dialog is built from this — a new one is `<DialogShell title footer>{body}
 * </DialogShell>`.
 */
export interface DialogShellProps {
  /** Header title. */
  title: string
  /** Called on backdrop click, the close button, and Escape. */
  onClose: () => void
  /** Footer content — typically Cancel + a primary Button, right-aligned. */
  footer: ReactNode
  /** The dialog body. Wrap fields in `Field`; the body owns its own gap. */
  children: ReactNode
  /** Extra classes on the body (e.g. `flex flex-col gap-6 overflow-y-auto`). */
  bodyClassName?: string
  /** Card width in px. Defaults to 502 (Peek's standard dialog width). */
  width?: number
}

export function DialogShell({ title, onClose, footer, children, bodyClassName, width = 502 }: DialogShellProps) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated shadow-lg"
          style={{ width }}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle pl-5 pr-4">
            <span className="text-h4 text-text-primary">{title}</span>
            <IconButton tooltip="Close" aria-label="Close" onClick={onClose}>
              <IconX size={16} stroke={1.5} />
            </IconButton>
          </div>

          <div className={cn('border-b border-border-subtle py-4 pl-5 pr-4', bodyClassName)}>{children}</div>

          <div className="flex h-12 shrink-0 items-center justify-end gap-2 pl-5 pr-4">{footer}</div>
        </div>
      </div>
    </>,
    document.body,
  )
}
