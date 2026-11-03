import { useState } from 'react'
import { MoveDialog } from '@estiva-app/ui'

/**
 * Move a project to another top-level Folder (FOL-7) — the kit's
 * `MoveDialog`, in Ship's words: one destination, and only the Folders a move
 * can land in.
 *
 * **A Folder with no state is not offered**, as in Peek: an `add` to one
 * would list only this project and hide the rest (`planMoveFile` refuses it).
 *
 * **Where it is now is not offered — unless it is in more than one.** A move
 * that half-worked leaves a project listed in two Folders; moving it into
 * either takes it out of the other, so both stay destinations and pressing
 * Move again is the retry: `from` is then empty, as the kit's dialog takes it.
 * The dialog stays open for exactly that.
 *
 * It opens on a destination, as Ship's always did: the first Folder it is not
 * in, chosen once (`startIn`).
 */
export interface MoveProjectFolder {
  id: string
  name: string
  /** From the Folder read — a move into or out of a Folder without state is refused. */
  hasState: boolean
  /** The Folder's `kind:39000` is private — a project, readable by the whole workspace, is refused there. */
  private?: boolean
}

export interface MoveProjectDialogProps {
  /** The project's title, said once above the choice. */
  title: string
  /** The top-level Folders that list it now (`placedIn`). */
  current: readonly MoveProjectFolder[]
  /** The top-level Folders (`topLevelFolders`). */
  folders: readonly MoveProjectFolder[]
  /** Resolve `false` to keep the dialog open — the caller has said why. */
  onMove: (to: MoveProjectFolder) => Promise<boolean>
  onClose: () => void
}

export function MoveProjectDialog({ title, current, folders, onMove, onClose }: MoveProjectDialogProps) {
  const from = current.length === 1 ? current[0].id : ''
  const withState = folders.filter((folder) => folder.hasState)
  const candidates = withState.filter((folder) => folder.id !== from)
  const [startIn] = useState(() => (candidates.find((folder) => !current.some((here) => here.id === folder.id)) ?? candidates[0])?.id)

  return (
    <MoveDialog
      heading="Move to Folder"
      title={title}
      description="Only the Folder it is listed in changes. Its issues and its conversation stay exactly as they are."
      folderLabel="Destination Folder"
      noFolder="There is no other Folder it can be moved to."
      from={from}
      folders={withState.map(({ id, name }) => ({ id, name }))}
      {...(startIn ? { startIn } : {})}
      onMove={({ folder }) => {
        const target = withState.find((candidate) => candidate.id === folder)
        return target ? onMove(target) : false
      }}
      onClose={onClose}
    />
  )
}
