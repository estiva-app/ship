import { useId, useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { TextInput } from '@/components/ui/TextInput'

/**
 * "New folder" from the sidebar (FOL-8): one field, Peek's `CreateFolderDialog`
 * word for word where the words apply. A Folder is a name and nothing else on
 * the wire, so there is nothing further to ask for.
 *
 * It is made top-level and open — the relay's default, as Peek makes it — so
 * it shows in everyone's sidebar at once, beside the teams.
 */
export interface NewFolderDialogProps {
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (name: string) => Promise<boolean>
}

export function NewFolderDialog({ onClose, onCreate }: NewFolderDialogProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const trimmed = name.trim()

  const submit = async () => {
    if (!trimmed || busy) return
    setBusy(true)
    try {
      if (await onCreate(trimmed)) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="New folder"
      onClose={onClose}
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed || busy}>
            {busy ? 'Creating…' : 'Create folder'}
          </Button>
        </>
      }
    >
      <Form id={formId} onSubmit={submit} busy={busy}>
        <p className="text-body-2 text-text-secondary">A place for projects, shown to everyone at the top of the sidebar.</p>
        <Field label="Folder name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="What is it for?" autoFocus />
        </Field>
      </Form>
    </DialogShell>
  )
}
