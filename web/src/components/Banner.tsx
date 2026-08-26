import { cn } from '@/lib/cn'

/**
 * The strip under the header where the app says something happened — today's
 * `#banner`: "Public key copied.", or the reason the last read failed. One
 * line, two tones, gone when there is nothing to say.
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
        'px-4 py-2 text-caption',
        tone === 'error' ? 'bg-error-muted text-error-default' : 'bg-success-muted text-success-default',
        className,
      )}
    >
      {children}
    </div>
  )
}
