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
  /**
   * The team's name today: the dialog renames it instead — "Rename team", Rename, the field filled — from a team page's
   * ⋮ (D6), word for word Peek's `CreateFolderDialog` in its rename. A rename to the name it already has is not offered.
   */
  rename?: string
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (name: string) => Promise<boolean>
}

export function NewFolderDialog({ rename, onClose, onCreate }: NewFolderDialogProps) {
  const [name, setName] = useState(rename ?? '')
  const trimmed = name.trim()
  // A rename to the name it already has would write and change nothing.
  const unchanged = rename !== undefined && trimmed === rename.trim()

  return (
    // The kit's FormDialog owns the send: its busy words, everything waiting, closing once it went through.
    <FormDialog
      title={rename !== undefined ? 'Rename team' : 'New team'}
      submitLabel={rename !== undefined ? 'Rename' : 'Create team'}
      busyLabel={rename !== undefined ? 'Renaming…' : 'Creating…'}
      ready={trimmed !== '' && !unchanged}
      onSubmit={() => onCreate(trimmed)}
      onClose={onClose}
    >
      {rename === undefined && <p className="text-body-2 text-text-secondary">A place for projects, shown to everyone at the top of the sidebar.</p>}
      <Field label="Team name">
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="What is it for?" autoFocus />
      </Field>
    </FormDialog>
  )
}
