import { IconTrash } from '@tabler/icons-react'
import { Link } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { linkTo } from '../router'

/** A deleted project in the Archived view's Deleted filter: its title, who deleted it and when, and Restore (story "Deleted, in the Archived view", ALO-4). */
export interface DeletedProjectRowProps {
  href: string
  title: string
  /** "Deleted by <who> · <when>", in the app's words. */
  deleted: string
  /** Bring it back; the button waits for it. */
  onRestore: () => Promise<unknown>
}

export function DeletedProjectRow({ href, title, deleted, onRestore }: DeletedProjectRowProps) {
  return (
    <div className="flex items-center gap-2 py-2">
      <IconTrash size={16} stroke={1.5} className="shrink-0 text-text-muted" aria-hidden />
      <span className="min-w-0 flex-1 text-body-2 text-text-primary">
        <Link {...linkTo(href)} variant="plain" truncate>
          {title || 'Untitled project'}
        </Link>
      </span>
      <span className="shrink-0 text-caption text-text-muted">{deleted}</span>
      <Button variant="outlined" size="small" className="shrink-0" onClick={onRestore}>
        Restore
      </Button>
    </div>
  )
}
