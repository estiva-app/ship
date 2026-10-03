import { useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'

/**
 * Move a project to another top-level Folder (FOL-7) — Peek's
 * `MoveFileDialog`, for a project: one destination as a `Select`, and only
 * the Folders a move can land in.
 *
 * **A Folder with no state is not offered**, as in Peek: an `add` to one
 * would list only this project and hide the rest (`planMoveFile` refuses it).
 *
 * **Where it is now is not offered — unless it is in more than one.** A move
 * that half-worked leaves a project listed in two Folders; moving it into
 * either takes it out of the other, so both stay destinations and pressing
 * Move again is the retry. The dialog stays open for exactly that.
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
  const only = current.length === 1 ? current[0].id : undefined
  const candidates = folders.filter((folder) => folder.hasState && folder.id !== only)
  const [to, setTo] = useState(() => (candidates.find((folder) => !current.some((here) => here.id === folder.id)) ?? candidates[0])?.id ?? '')
  const [moving, setMoving] = useState(false)
  const target = candidates.find((folder) => folder.id === to)

  async function move() {
    if (!target || moving) return
    setMoving(true)
    try {
      if (await onMove(target)) onClose()
    } finally {
      setMoving(false)
    }
  }

  return (
    <DialogShell
      title="Move to Folder"
      onClose={onClose}
      footer={
        <>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="move-project" disabled={!target || moving}>
            {moving ? 'Moving…' : 'Move'}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <EmptyState scope="section" message="There is no other Folder it can be moved to." />
      ) : (
        <Form id="move-project" busy={moving} onSubmit={move}>
          <div className="flex flex-col gap-2">
            <p className="text-body-2-strong text-text-primary">{title}</p>
            <p className="text-body-2 text-text-secondary">
              Only the Folder it is listed in changes. Its issues and its conversation stay exactly as they are.
            </p>
          </div>
          <Field label="Destination Folder">
            <Select
              value={to}
              onChange={setTo}
              options={candidates.map((folder) => ({ value: folder.id, label: folder.name }))}
              ariaLabel="Destination Folder"
            />
          </Field>
        </Form>
      )}
    </DialogShell>
  )
}
