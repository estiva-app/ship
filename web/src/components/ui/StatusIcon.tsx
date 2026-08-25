import { IconCircle, IconCircleCheck, IconCircleDashed, IconCircleHalf2, IconCircleX } from '@tabler/icons-react'
import { cn } from '@/lib/cn'

/**
 * A status as a shape, not a dot (ruling C14: shaped status icons, Tabler).
 *
 * Ship-only, because Peek has no status vocabulary — but the two shapes Peek
 * does have carry over so the apps agree: an open thing is `circle-dashed`
 * (Peek's unresolved topic) and a finished one is `circle-check` in the
 * success colour (Peek's resolved). In between, `circle-half-2` in the info
 * colour; cancelled is `circle-x`, muted. A status the vocabulary does not
 * know is drawn as a plain circle in muted — shown, not hidden, since it was
 * written by some other app and is still true.
 *
 * Issues and projects share the shapes: `todo` and `planned` are the same
 * state, as are `done` and `completed`.
 */
export interface StatusIconProps {
  /** The raw status value — `todo`, `in_progress`, `done`, `cancelled`, `planned`, `completed`, or anything. */
  value: string
  /** 16 on default controls, 14 on small ones. */
  size?: 16 | 14
  className?: string
}

export function StatusIcon({ value, size = 16, className }: StatusIconProps) {
  const common = { size, stroke: 1.5 }
  switch (value) {
    case 'todo':
    case 'planned':
      return <IconCircleDashed {...common} className={cn('shrink-0 text-text-secondary', className)} />
    case 'in_progress':
      return <IconCircleHalf2 {...common} className={cn('shrink-0 text-info-default', className)} />
    case 'done':
    case 'completed':
      return <IconCircleCheck {...common} className={cn('shrink-0 text-success-default', className)} />
    case 'cancelled':
      return <IconCircleX {...common} className={cn('shrink-0 text-text-muted', className)} />
    default:
      return <IconCircle {...common} className={cn('shrink-0 text-text-muted', className)} />
  }
}
