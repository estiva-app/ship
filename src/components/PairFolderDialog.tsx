import { useState } from 'react'
import { Form } from '@estiva-app/ui'
import { parseFolderLink } from '@/api'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { TextInput } from '@/components/ui/TextInput'

/**
 * Production's "Pair with another Folder…" prompt (apps/ship/views/project.ts)
 * as a dialog. Re-linking is a change event, so anyone in the workspace can
 * do it — usually necessary, because the person who owns the Peek topic is
 * frequently not the person who created the project. Issues already filed
 * keep their Folder and stay readable; nothing moves, because nothing can.
 * The dialog says so rather than letting someone discover it afterwards.
 */
export interface PairFolderDialogProps {
  /** The Folder the project is paired with today — pasting it again is a no-op, said as such. */
  currentFolder: string
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onPair: (folder: string) => Promise<boolean | void> | boolean | void
}

export function PairFolderDialog({ currentFolder, onClose, onPair }: PairFolderDialogProps) {
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canSubmit = link.trim().length > 0 && !busy

  const submit = async () => {
    if (!canSubmit) return
    const parsed = parseFolderLink(link)
    if (!parsed) return setError('That does not look like a Folder link or a UUID.')
    if (parsed === currentFolder) return setError('Already paired with that Folder.')
    setError(null)
    setBusy(true)
    try {
      const ok = await onPair(parsed)
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="Pair with another Folder"
      onClose={onClose}
      bodyClassName="flex flex-col gap-4"
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="pair-folder" disabled={!canSubmit}>
            Pair
          </Button>
        </>
      }
    >
      <p className="text-body-2 text-text-secondary">
        New issues will go to the Folder you paste. Issues already filed stay readable in the old Folder — events cannot move.
      </p>
      <Form id="pair-folder" onSubmit={submit} busy={busy}>
        {/* The error line is Field's own since 0.10.0 (S7): it marks the
            control invalid and is announced, which the hand-built span was not. */}
        <Field label="Folder link" error={error ?? undefined}>
          <TextInput
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setError(null)
            }}
            placeholder="Paste a Peek topic's Folder link"
            autoFocus
          />
        </Field>
      </Form>
    </DialogShell>
  )
}
