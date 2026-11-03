import { useState } from 'react'
import { FormDialog } from '@estiva-app/ui'
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
  const trimmed = name.trim()

  return (
    // The kit's FormDialog owns the send: its busy words, everything waiting, closing once it went through.
    <FormDialog title="New folder" submitLabel="Create folder" busyLabel="Creating…" ready={trimmed !== ''} onSubmit={() => onCreate(trimmed)} onClose={onClose}>
      <p className="text-body-2 text-text-secondary">A place for projects, shown to everyone at the top of the sidebar.</p>
      <Field label="Folder name">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="What is it for?" autoFocus />
      </Field>
    </FormDialog>
  )
}
