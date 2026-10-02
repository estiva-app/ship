import { useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/TextInput'
import { Textarea } from '@/components/ui/Textarea'

/**
 * Production's "New project" form (apps/ship/views/projects.ts) in the
 * DialogShell: a title, an optional description, and the team it is filed
 * into (FOL-2, SPEC §6.7). A project no longer gets a Folder of its own or
 * pairs with a pasted one: its issues and conversation live in the team's.
 *
 * **The team is required and starts unchosen.** A default would be a guess,
 * and a project filed into the wrong team is listed there for everyone.
 */
export interface NewProjectTeam {
  id: string
  name: string
  /** From the Folder read — whether the team lists by state, which the listing command needs. */
  hasState: boolean
}

export interface NewProjectDraft {
  title: string
  description: string
  team: { folder: string; hasState: boolean }
}

export interface NewProjectDialogProps {
  /** The teams a project can be filed into (`topLevelFolders`); `undefined` while they are read. */
  teams: NewProjectTeam[] | undefined
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (draft: NewProjectDraft) => Promise<boolean | void> | boolean | void
}

export function NewProjectDialog({ teams, onClose, onCreate }: NewProjectDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const team = teams?.find((candidate) => candidate.id === teamId)
  const canSubmit = title.trim().length > 0 && team !== undefined && !busy

  const submit = async () => {
    if (!canSubmit || !team) return
    setBusy(true)
    try {
      const ok = await onCreate({ title: title.trim(), description: description.trim(), team: { folder: team.id, hasState: team.hasState } })
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
      <Form id="new-project" onSubmit={submit} busy={busy}>
        <Field label="Title" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project title" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="h-[80px]" />
        </Field>
        <Field
          label="Folder"
          required
          helper={teams?.length === 0 ? 'No Folders to file into — the relay did not answer, or there are none yet.' : 'Its issues and conversation live in this Folder.'}
        >
          <Select
            value={teamId}
            onChange={setTeamId}
            options={(teams ?? []).map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            placeholder="Choose a Folder"
            disabled={!teams?.length}
            disabledReason={teams === undefined ? 'Reading the Folders…' : teams.length === 0 ? 'No Folders to file into' : undefined}
          />
        </Field>
      </Form>
    </DialogShell>
  )
}
