import { useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/TextInput'
import { Textarea } from '@/components/ui/Textarea'
import { heldFields, releaseHeld, useHeldTyping } from '@/auth/heldTyping'
import { summaryText } from '@/nostr/summary'
import { SummaryField } from './SummaryField'

/**
 * Production's "New project" form (apps/ship/views/projects.ts) in the
 * DialogShell: a title, an optional description, and the team it is filed
 * into (FOL-2, SPEC §6.7). A project no longer gets a Folder of its own or
 * pairs with a pasted one: its issues and conversation live in the team's.
 *
 * **The team is required and starts unchosen.** A default would be a guess,
 * and a project filed into the wrong team is listed there for everyone.
 *
 * **The key is prefilled and editable** (SHI-4, Miky 2026-10-13): it follows
 * the title — the shortest free 3–6 letters — until the person types their
 * own, and one another project holds is refused here, before anything is
 * published. It is fixed once the project exists.
 */
export interface NewProjectTeam {
  id: string
  name: string
  /** From the Folder read — whether the team lists by state, which the listing command needs. */
  hasState: boolean
}

export interface NewProjectDraft {
  title: string
  /** Optional; empty creates the project with no summary (no root tag). */
  summary: string
  description: string
  key: string
  team: { folder: string; hasState: boolean }
}

export interface NewProjectDialogProps {
  /** The teams a project can be filed into (`topLevelFolders`); `undefined` while they are read. */
  teams: NewProjectTeam[] | undefined
  /** The shortest free key for a title (`suggestKey` over what is visible). */
  suggestKey: (title: string) => string
  /** Why a key cannot be used, or undefined when it can (`keyProblem`). */
  keyProblem: (key: string) => string | undefined
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (draft: NewProjectDraft) => Promise<boolean | void> | boolean | void
  /** Where its unsaved fields are held when the sign-in ends while it is open (AUT-4); the page reopens it from there. */
  holdKey?: string
}

/** What a New project dialog holds through the passkey trip (AUT-4). */
interface HeldProject {
  title: string
  summary: string
  description: string
  typedKey: string
  teamId: string
}

export function NewProjectDialog({ teams, suggestKey, keyProblem, onClose, onCreate, holdKey }: NewProjectDialogProps) {
  // What was typed here when the sign-in last ended, back after the passkey tap (AUT-4).
  const [held] = useState(() => heldFields<HeldProject>(holdKey))
  const [title, setTitle] = useState(held?.title ?? '')
  const [summary, setSummary] = useState(held?.summary ?? '')
  const [description, setDescription] = useState(held?.description ?? '')
  // Undefined until the person types one: until then the key follows the title.
  const [typedKey, setTypedKey] = useState<string | undefined>(held?.typedKey)
  const [teamId, setTeamId] = useState(held?.teamId ?? '')
  const [busy, setBusy] = useState(false)

  useHeldTyping(holdKey, () =>
    title.trim() || summary.trim() || description.trim() || typedKey ? JSON.stringify({ title, summary, description, typedKey, teamId }) : undefined,
  )
  const close = () => {
    if (holdKey) releaseHeld(holdKey)
    onClose()
  }
  const team = teams?.find((candidate) => candidate.id === teamId)
  const key = typedKey ?? (title.trim() ? suggestKey(title) : '')
  const problem = key ? keyProblem(key) : undefined
  const canSubmit = title.trim().length > 0 && key.length > 0 && !problem && team !== undefined && !busy

  const submit = async () => {
    if (!canSubmit || !team) return
    setBusy(true)
    try {
      const ok = await onCreate({ title: title.trim(), summary: summaryText(summary), description: description.trim(), key, team: { folder: team.id, hasState: team.hasState } })
      if (ok !== false) close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title="New project"
      onClose={close}
      bodyClassName="flex flex-col gap-6"
      footer={
        <>
          <Button variant="muted" onClick={close} disabled={busy}>
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
        <SummaryField value={summary} onChange={setSummary} />
        <Field label="Key" required helper={problem ? undefined : `Its issues are ${key || 'KEY'}-1, ${key || 'KEY'}-2, …`} error={problem}>
          <TextInput
            value={key}
            onChange={(e) => setTypedKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
            placeholder="ABC"
          />
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
