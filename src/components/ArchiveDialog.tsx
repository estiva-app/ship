import { useId, useState } from 'react'
import { Form } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { DialogShell } from '@/components/ui/DialogShell'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'

/**
 * Archive a project, an issue or a Folder: what it hides, counted, and an optional resolution summary (FOL-46).
 *
 * A `DialogShell` with a `Form`, not a `ConfirmDialog` (1 October): it asks for
 * a resolution, and a question with a field is a form. So Ctrl+Enter archives
 * from the field, the field is switched off while it archives, and Escape or a
 * press outside closes it, as every other dialog with fields does.
 */
export interface ArchiveDialogProps {
  /** The file's name, for the title. */
  title: string
  /** What it is, in a word: "project", "issue", "folder". */
  what: string
  /**
   * What goes out of the lists with it, already counted and worded — "its 14
   * issues", "3 projects only in this folder". Empty: it hides nothing else.
   */
  hides: string[]
  /** What it lists that stays visible somewhere else, worded — "2 projects also in Steer". */
  staysVisible?: string[]
  onClose: () => void
  /** Resolve `false` to keep the dialog open (the caller has said why). */
  onArchive: (resolution: string) => Promise<boolean>
}

/** "and" between the last two, commas before: "a, b and c". */
function list(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function ArchiveDialog({ title, what, hides, staysVisible = [], onClose, onArchive }: ArchiveDialogProps) {
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const formId = useId()
  const archive = async () => {
    setBusy(true)
    try {
      if ((await onArchive(resolution.trim())) !== false) onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogShell
      title={`Archive “${title}”?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="muted" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {`Archive ${what}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-2 text-text-primary">
        <p>
          {hides.length
            ? `This hides the ${what} and ${list(hides)} from every list, in Ship and in Peek.`
            : `This hides the ${what} from every list, in Ship and in Peek.`}
        </p>
        {staysVisible.length > 0 && <p>{`${list(staysVisible)} stay visible there.`}</p>}
        <p className="text-text-secondary">Nothing is deleted: a link still opens it, and Unarchive brings everything back as it was.</p>
        {/* The package Form: Ctrl+Enter archives from the resolution; Enter there is a new line. */}
        <Form id={formId} busy={busy} onSubmit={() => void archive()}>
          <Field label="Resolution (optional)">
            <Textarea
              value={resolution}
              rows={3}
              placeholder={`What happened with this ${what}? Shown first to anyone who opens it.`}
              onChange={(event) => setResolution(event.target.value)}
            />
          </Field>
        </Form>
      </div>
    </DialogShell>
  )
}
