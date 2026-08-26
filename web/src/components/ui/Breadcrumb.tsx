import { Fragment } from 'react'
import { cn } from '@/lib/cn'

/**
 * A trail: "Issues / Relay Migration / REL-6". `@estiva/ui` candidate —
 * Peek has no breadcrumb yet; nothing here knows what a project is.
 *
 * An item with an `href` is a link, even when it is last — an issue with no
 * ref ends its trail on its project, which is still somewhere to go. The
 * last item is where you are when it has none, and may be `mono` (an
 * issue's ref, as production sets it) or plain. A separator is the
 * slash production uses, muted, never read aloud.
 */
export interface Crumb {
  label: string
  href?: string
  /** Set the item in the mono face — a ref, an id. */
  mono?: boolean
  /** Quieter — a label that is not a place. */
  muted?: boolean
}

export interface BreadcrumbProps {
  items: Crumb[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center gap-1.5 text-body-2', className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1
        // The mono size is an arbitrary value (the caption token) because this string
        // goes through cn() and a token size before a colour class is dropped.
        const text = cn('truncate', item.mono && 'font-mono text-[12px] leading-[120%]', item.muted || (last && item.mono) ? 'text-text-muted' : last ? 'text-text-primary' : 'text-text-secondary')
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span aria-hidden="true" className="shrink-0 text-text-muted">
                /
              </span>
            )}
            {item.href ? (
              <a href={item.href} className={cn(text, 'hover:text-text-primary')}>
                {item.label}
              </a>
            ) : (
              <span className={text} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
