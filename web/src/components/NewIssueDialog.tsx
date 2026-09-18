import { useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/TextInput'
import { Textarea } from '@/components/ui/Textarea'

/**
 * Production's "New issue" form (apps/ship/views/new-issue.ts) in the
 * DialogShell. An issue lives in a project's Folder, so it always has a
 * project: preselected when opened from a project page, chosen from a
 * select when opened from the Issues page — and when there is no project
 * at all, the form says to create one first rather than offer a field that
 * cannot succeed.
 * @registry reusable: stays in Ship (Katerina, 18 September): Ship's issue form on estiva-ui's dialog
 */
export interface NewIssueDraft {
  title: string
  description: string
  projectAddr: string
}

export interface NewIssueDialogProps {
  /** Every project an issue could go in — value is the address. */
  projects: SelectOption[]
  /** Opened from a project page: that project, fixed. */
  project?: { addr: string; title: string }
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onCreate: (draft: NewIssueDraft) => Promise<boolean | void> | boolean | void
}

export function NewIssueDialog({ projects, project, onClose, onCreate }: NewIssueDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectAddr, setProjectAddr] = useState(project?.addr ?? projects[0]?.value ?? '')
  const [busy, setBusy] = useState(false)
  const none = !project && projects.length === 0
  const canSubmit = title.trim().length > 0 && projectAddr !== '' && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      const ok = await onCreate({ title: title.trim(), description: description.trim(), projectAddr })
      if (ok !== false) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={project ? `New issue in ${project.title}` : 'New issue'}
      onClose={onClose}
      bodyClassName="flex flex-col gap-6"
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!none && (
            <Button variant="primary" type="submit" form="new-issue" disabled={!canSubmit}>
              Create issue
            </Button>
          )}
        </>
      }
    >
      {none ? (
        <EmptyState scope="section" message="Create a project first." />
      ) : (
        <Form id="new-issue" onSubmit={submit} busy={busy} className="flex flex-col gap-6">
          <Field label="Title" required>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={project ? `New issue in ${project.title}` : 'Issue title'} autoFocus />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="h-[80px]" />
          </Field>
          {!project && (
            <Field label="Project" required>
              <Select value={projectAddr} onChange={setProjectAddr} options={projects} ariaLabel="Project" />
            </Field>
          )}
        </Form>
      )}
    </DialogShell>
  )
}
