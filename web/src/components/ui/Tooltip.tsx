import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

/**
 * Peek's Tooltip and WithTooltip, verbatim (2026-08-25) — the same 30px
 * elevated pill, the same fixed-position portal clamped to the viewport.
 * A candidate for `@estiva/ui`; until SHA-5 lands it is copied, not shared,
 * and any edit here is a drift to reconcile.
 */
interface TooltipProps {
  label: string
  className?: string
}

export function Tooltip({ label, className }: TooltipProps) {
  return (
    <div
      role="tooltip"
      className={cn(
        'flex h-[30px] items-center justify-center rounded-lg border border-border-default bg-bg-elevated px-2 shadow-lg',
        className,
      )}
    >
      <span className="whitespace-nowrap text-caption text-text-primary">{label}</span>
    </div>
  )
}

interface WithTooltipProps {
  label: string
  placement?: 'top' | 'bottom'
  children: ReactNode
}

const GAP = 6
const VIEWPORT_PAD = 8

export function WithTooltip({ label, placement = 'top', children }: WithTooltipProps) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    visibility: 'hidden',
  })

  const reposition = useCallback(() => {
    const trigger = ref.current
    const tip = tooltipRef.current
    if (!trigger || !tip) return
    const triggerRect = trigger.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const top =
      placement === 'bottom' ? triggerRect.bottom + GAP : triggerRect.top - tipRect.height - GAP
    let left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_PAD))
    setStyle({ position: 'fixed', top, left, zIndex: 9999, pointerEvents: 'none', visibility: 'visible' })
  }, [placement])

  useLayoutEffect(() => {
    if (show) reposition()
  }, [show, reposition])

  return (
    <span
      ref={ref}
      className="inline-flex shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div ref={tooltipRef} style={style}>
            <Tooltip label={label} />
          </div>,
          document.body,
        )}
    </span>
  )
}
