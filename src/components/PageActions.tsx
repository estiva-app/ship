import { IconDotsVertical, IconMessage, IconMessageOff } from '@tabler/icons-react'
import { Menu, MenuItem, MenuSeparator, Toolbar, ToolbarButton } from '@estiva-app/ui'

/**
 * The page's own buttons at the right of its header, one strip as Leaf's and Peek's (ONE-6, steps 4b and 4c): the
 * comments column shown or hidden, then the ⋯ with what the details column's buttons did (Katerina, 1 November).
 *
 * The ⋯'s rows:
 * - Not archived: a project's **Move to Folder…** first (once the Folders are read), **Copy link**, then **Archive**
 *   and **Delete**.
 * - Archived itself: only the way back, **Unarchive**, and **Delete**.
 * - Archived only with what holds it (SPEC §6.5): its own **Archive** and **Delete**. An issue's own Archive stays
 *   open under its project's archive; a project's is shut under its Folder's, saying why. The way back is the
 *   notice's "Open project" / "Open Folder".
 *
 * A row that cannot be used right now is shown shut and says why (the kit's `disabledReason`, 0.100.0), as the rail's
 * buttons did. Copy link writes nothing, so it is never shut.
 */
export interface PageActionsProps {
  what: 'issue' | 'project'
  /** The comments column, shown or not, and the button that shows or hides it. Omitted: no button. */
  comments?: { shown: boolean; onShownChange: (shown: boolean) => void }
  /** Not archived; archived itself; or archived only with its project or its Folder (FOL-46). */
  archive: 'none' | 'own' | 'with'
  /** Archive it, or unarchive it when it is archived itself. */
  onArchive: () => void
  onDelete: () => void
  /** "Move to Folder…" (FOL-7). Absent while the Folders are read, and for an issue: no row. */
  onMove?: () => void
  /** Copies the page's link and says so. */
  onCopyLink: () => void
  /** Why nothing can be written: every row but Copy link shut, saying it. */
  readOnlyReason?: string
  /** Why its fields are shut while archived: shuts a project's own Archive under its Folder's archive. */
  lockedReason?: string
}

export function PageActions({ what, comments, archive, onArchive, onDelete, onMove, onCopyLink, readOnlyReason, lockedReason }: PageActionsProps) {
  // Under its Folder's archive, archiving a project again is an edit; an issue's own stays offered whatever is archived above it.
  const archiveShut = archive === 'with' && what === 'project' ? (readOnlyReason ?? lockedReason) : readOnlyReason
  const commentsWord = comments?.shown ? 'Hide comments' : 'Show comments'
  return (
    // One strip: one Tab stop, arrows along it (the kit's Toolbar, no box of its own).
    <Toolbar aria-label="Page actions" surface={false}>
      {comments && (
        // The prototype's (Katerina, 1 November): the message icon, struck through while the column is shown.
        <ToolbarButton tooltip={commentsWord} aria-label={commentsWord} onClick={() => comments.onShownChange(!comments.shown)}>
          {comments.shown ? <IconMessageOff size={16} stroke={1.5} /> : <IconMessage size={16} stroke={1.5} />}
        </ToolbarButton>
      )}
      <Menu
        align="right"
        trigger={
          <ToolbarButton tooltip="More actions" aria-label="More actions">
            <IconDotsVertical size={16} stroke={1.5} />
          </ToolbarButton>
        }
      >
        {archive === 'none' && (
          <>
            {onMove && <MenuItem label="Move to Folder…" onClick={onMove} disabledReason={readOnlyReason} />}
            <MenuItem label="Copy link" onClick={onCopyLink} />
            <MenuSeparator />
          </>
        )}
        <MenuItem label={`${archive === 'own' ? 'Unarchive' : 'Archive'} ${what}`} onClick={onArchive} disabledReason={archiveShut} />
        <MenuItem label={`Delete ${what}`} destructive onClick={onDelete} disabledReason={readOnlyReason} />
      </Menu>
    </Toolbar>
  )
}
