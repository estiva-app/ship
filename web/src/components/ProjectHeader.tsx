import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Chip } from '@/components/ui/Chip'
import { EditableText } from '@/components/ui/EditableText'

/**
 * The top of the project page, as production: the title (click to edit) with
 * an "Archived" chip when archived, and the description under it (click to
 * edit, "Add a description…" when empty). Both edits are `kind:1851`
 * changes, published by the caller (REW-5).
 */
export interface ProjectHeaderProps {
  title: string
  description: string
  archived?: boolean
  onRename: (title: string) => Promise<boolean> | boolean
  onDescribe: (description: string) => Promise<boolean> | boolean
  /** Title and description as text only, for a reader who cannot write. */
  readOnly?: boolean
  /** Sits at the right of the title row — production's "Add issue" button. */
  action?: ReactNode
  className?: string
}

export function ProjectHeader({ title, description, archived = false, onRename, onDescribe, className, readOnly = false, action }: ProjectHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <EditableText readOnly={readOnly}
            label="Title"
            value={title}
            placeholder="Untitled project"
            onCommit={onRename}
            className="-mx-2 text-h2"
          />
          {archived && <Chip label="Archived" className="mt-2 shrink-0" />}
        </div>
        {action && <div className="flex shrink-0 items-center pt-0.5">{action}</div>}
      </div>
      <EditableText readOnly={readOnly}
        label="Description"
        value={description}
        placeholder="Add a description…"
        onCommit={onDescribe}
        multiline
        className="-mx-2 text-body-2"
      />
    </div>
  )
}
