import { IconDotsVertical, IconLayoutSidebarRight, IconMessage, IconMessageOff } from '@tabler/icons-react'
import { Menu, MenuItem, MenuSeparator, Toolbar, ToolbarButton } from '@estiva-app/ui'

/**
 * The page's own buttons at the right of its header, one strip as Leaf's and Peek's (ONE-6, steps 4b to 4d): the
 * comments shown or hidden, the Overview shown or hidden (Peek's side-panel button), then the ⋯ with what the details
 * column's buttons did (Katerina, 1 and 2 November). The comments and the Overview share the column beside the page.
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
  /**
   * A topic's page uses it too (TOPI-8): its button shows or hides the topic's conversation, and its ⋯ holds only
   * Copy link and Open in Peek. Ship does not archive, move or delete a topic; Peek does (Miky, 6 Nov).
   */
  what: 'issue' | 'project' | 'topic'
  /** A topic's ⋯: "Open in Peek", where its "Conversation in Peek" link was. Absent: no row. */
  onOpenInPeek?: () => void
  /**
   * The comments column, shown or not, and the button that shows or hides it. Omitted: no button. `unread`: something
   * in them is new to the reader; while the column is hidden the button carries the kit's dot on its icon's corner, and
   * its name says "new" (Katerina, 3 November).
   */
  comments?: { shown: boolean; onShownChange: (shown: boolean) => void; unread?: boolean }
  /** The Overview panel, shown or not: Peek's side-panel button, pressed while it is shown. Omitted: no button. */
  overview?: { shown: boolean; onShownChange: (shown: boolean) => void }
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

export function PageActions({ what, comments, overview, archive, onArchive, onDelete, onMove, onCopyLink, onOpenInPeek, readOnlyReason, lockedReason }: PageActionsProps) {
  // Under its Folder's archive, archiving a project again is an edit; an issue's own stays offered whatever is archived above it.
  const archiveShut = archive === 'with' && what === 'project' ? (readOnlyReason ?? lockedReason) : readOnlyReason
  const commentsWord = what === 'topic' ? (comments?.shown ? 'Hide conversation' : 'Show conversation') : comments?.shown ? 'Hide comments' : 'Show comments'
  const overviewWord = overview?.shown ? 'Hide side panel' : 'Show side panel'
  return (
    // One strip: one Tab stop, arrows along it (the kit's Toolbar, no box of its own).
    <Toolbar aria-label="Page actions" surface={false}>
      {comments && (
        // The prototype's (Katerina, 1 November): the message icon, struck through while the column is shown. Shown,
        // each new comment carries its own dot in the column; hidden, the button carries one on its icon's corner, and
        // its name says "new" (the kit's `unread`; Katerina, 3 November).
        <ToolbarButton
          tooltip={commentsWord}
          aria-label={commentsWord}
          unread={!comments.shown && !!comments.unread}
          onClick={() => comments.onShownChange(!comments.shown)}
        >
          {comments.shown ? <IconMessageOff size={16} stroke={1.5} /> : <IconMessage size={16} stroke={1.5} />}
        </ToolbarButton>
      )}
      {overview && (
        // Peek's SidePanelButton, its icon and its words: the sidebar, pressed while the Overview is shown (Katerina, 2 November).
        <ToolbarButton tooltip={overviewWord} aria-label={overviewWord} pressed={overview.shown} onClick={() => overview.onShownChange(!overview.shown)}>
          <IconLayoutSidebarRight size={16} stroke={1.5} />
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
        {what === 'topic' ? (
          <>
            <MenuItem label="Copy link" onClick={onCopyLink} />
            {onOpenInPeek && <MenuItem label="Open in Peek" onClick={onOpenInPeek} />}
          </>
        ) : (
          <>
            {archive === 'none' && (
              <>
                {onMove && <MenuItem label="Move to team…" onClick={onMove} disabledReason={readOnlyReason} />}
                <MenuItem label="Copy link" onClick={onCopyLink} />
                <MenuSeparator />
              </>
            )}
            <MenuItem label={`${archive === 'own' ? 'Unarchive' : 'Archive'} ${what}`} onClick={onArchive} disabledReason={archiveShut} />
            <MenuItem label={`Delete ${what}`} destructive onClick={onDelete} disabledReason={readOnlyReason} />
          </>
        )}
      </Menu>
    </Toolbar>
  )
}
