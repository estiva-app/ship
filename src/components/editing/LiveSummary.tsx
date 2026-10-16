import { useState } from 'react'
import { FieldLine } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { EditableText } from '@/components/ui/EditableText'
import { SummaryCount } from '@/components/SummaryField'

/**
 * A file's summary under its title on its own page: all of it, click to edit, with a count past about 240 and a refused save said in the field.
 *
 * The short-summary prototype's `OwnSummary` (estiva-ui `concept/short-summary`,
 * approved by Miky 15 Oct; record a-files-summary-is-its-own-field):
 * - **Someone who can edit** clicks it to change it — the package's
 *   `EditableText`, a plain text box: Enter or leaving it saves, Escape puts
 *   the saved one back. Empty, it says "Add a summary", quietly.
 * - **Someone who cannot** (no rights, or an archived file) reads the text, and
 *   sees nothing at all when there is none.
 * - **Past about 240 characters** a count appears under the field; nothing is
 *   refused (Miky, 15 Oct, call 1 A).
 * - **A save the relay refuses**: the page keeps the summary the relay holds,
 *   and your text stays in the field with the reason, until you change it,
 *   save it, or Escape (why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-refused-action-is-undone-and-your-text-comes-back.md).
 *   `EditableText` already keeps a refused field open; the reason is drawn
 *   here, under it, as the prototype's `SummaryBeingWritten` does.
 *
 * Plain text on one line (SPEC §6.12): line breaks typed with Shift+Enter are
 * saved as spaces, and clearing it to nothing removes the summary.
 *
 * The count and the reason need the text being typed, which `EditableText`
 * keeps to itself, so they are read from the field's own events as they
 * bubble out of it — observed, not handled: the field still owns its keys.
 */
export function LiveSummary({
  value,
  onCommit,
  readOnly = false,
}: {
  /** The summary the relay holds; empty when there is none. */
  value: string
  /** Save it: `true`, or the words for why the relay refused. Empty text clears it. Omitted, it is text only. */
  onCommit?: (value: string) => Promise<true | string>
  readOnly?: boolean
}) {
  // The text in the open field while it is being written, for the count; null when it is not.
  const [typing, setTyping] = useState<string | null>(null)
  const [refused, setRefused] = useState<string>()

  if (readOnly || !onCommit) return value ? <p className="-mx-2 px-2 py-1 text-body-1 text-text-secondary">{value}</p> : null

  const commit = async (next: string) => {
    const text = next.replace(/\s+/g, ' ').trim()
    if (text === value) {
      setRefused(undefined)
      return true
    }
    const result = await onCommit(text)
    if (result === true) {
      setRefused(undefined)
      return true
    }
    setRefused(result)
    return false
  }

  const field = (target: EventTarget) => (target instanceof HTMLTextAreaElement ? target : null)
  return (
    // The size is set here: EditableText takes the size around it.
    <div
      className="flex flex-col gap-1 text-body-1"
      onFocus={(event) => {
        const box = field(event.target)
        if (box) setTyping(box.value)
      }}
      onInput={(event) => {
        const box = field(event.target)
        if (!box) return
        setTyping(box.value)
        setRefused(undefined)
      }}
      onBlur={(event) => {
        if (field(event.target)) setTyping(null)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !field(event.target)) return
        setTyping(null)
        setRefused(undefined)
      }}
    >
      {/* @estiva-escape(no-restyled-part): EditableText has no quieter tone, and the approved short-summary prototype (Miky, 15 Oct) draws a summary in the secondary colour under the title; the tone belongs in the package */}
      <EditableText multiline label="Summary" placeholder="Add a summary" value={value} onCommit={commit} className={cn('-mx-2', value && 'text-text-secondary')} />
      {typing !== null && <SummaryCount text={typing} />}
      {refused && <FieldLine tone="error">Summary not saved. {refused} Your text is still here.</FieldLine>}
    </div>
  )
}
