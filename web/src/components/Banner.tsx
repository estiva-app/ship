import { cn } from '@/lib/cn'

/**
 * The strip under the header where the app says something happened — today's
 * `#banner`: "Public key copied.", or the reason the last read failed. One
 * line, two tones, gone when there is nothing to say.
 *
 * body-2, her ruling (2026-09-01): the caption this said before never
 * rendered — stock tailwind-merge dropped it beside the tone colour — so the
 * strip has always read at 14px, and 14px is what she chose to keep.
 */
export interface BannerProps {
  tone: 'ok' | 'error'
  children: string
  className?: string
}

export function Banner({ tone, children, className }: BannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'px-4 py-2 text-body-2',
        tone === 'error' ? 'bg-error-muted text-error-default' : 'bg-success-muted text-success-default',
        className,
      )}
    >
      {children}
    </div>
  )
}
