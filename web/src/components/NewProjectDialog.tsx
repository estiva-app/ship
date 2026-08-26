import { useState, type FormEvent } from 'react'
import { parseFolderLink } from '@/api'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { TextInput } from '@/components/ui/TextInput'
import { Textarea } from '@/components/ui/Textarea'

/**
 * Production's "New project" form (apps/ship/views/projects.ts) in the
 * DialogShell: a title, an optional description, and — PEEK-17's from-Ship
 * half — an optional Folder link. Paste a Peek topic's link and the project
 * is created *in* that topic, one container from the first event; leave it
 * blank and the project gets a Folder of its own.
 *
 * The link is checked before anything is published: a bad Folder id would
 * otherwise create the project and fail on the second write.
 */
export interface NewProjectDraft {
  title: string
  description: string
  /** A Folder uuid parsed from what was pasted; absent = a fresh Folder. */
  folder?: string
}

export interface NewProjectDialogProps {
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (draft: NewProjectDraft) => Promise<boolean | void> | boolean | void
}

export function NewProjectDialog({ onClose, onCreate }: NewProjectDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pair, setPair] = useState('')
  const [pairError, setPairError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canSubmit = title.trim().length > 0 && !busy

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    let folder: string | undefined
    if (pair.trim()) {
      const parsed = parseFolderLink(pair)
      if (!parsed) {
        setPairError('That does not look like a Folder link or a UUID.')
        return
      }
      folder = parsed
    }
    setPairError(null)
    setBusy(true)
    try {
      const ok = await onCreate({ title: title.trim(), description: description.trim(), folder })
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="New project"
      onClose={onClose}
      bodyClassName="flex flex-col gap-6"
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-project" disabled={!canSubmit}>
            Create project
          </Button>
        </>
      }
    >
      <form id="new-project" onSubmit={submit} className="flex flex-col gap-6">
        <Field label="Title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project title" autoFocus disabled={busy} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="h-[80px]" disabled={busy} />
        </Field>
        <Field label="Pair with an existing Folder">
          <div className="flex flex-col gap-1.5">
            <TextInput
              value={pair}
              onChange={(e) => {
                setPair(e.target.value)
                setPairError(null)
              }}
              placeholder="Paste a Peek topic link (optional)"
              className="font-mono"
              aria-invalid={pairError ? true : undefined}
              disabled={busy}
            />
            <span className={pairError ? 'text-caption text-error-default' : 'text-caption text-text-muted'}>
              {pairError ?? 'Leave empty and the project gets a Folder of its own.'}
            </span>
          </div>
        </Field>
      </form>
    </DialogShell>
  )
}
