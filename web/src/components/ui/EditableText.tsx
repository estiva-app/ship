import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

/**
 * Text you click to edit — production's `editableText`, as a component.
 * `@estiva-app/ui` candidate: nothing here knows what is being edited.
 *
 * Reads as text until clicked; then it is a field. Enter commits (Shift+Enter
 * is a new line when multiline), Escape cancels, blur commits. A commit that
 * fails keeps the field open with the text in it, so an edit is never
 * silently lost — the caller has already said why. An unchanged value is not
 * committed at all. Empty shows the placeholder, muted.
 */
export interface EditableTextProps {
  value: string
  placeholder: string
  /** Resolve `true` when saved; `false` (or throw) keeps the field open with the text. */
  onCommit: (value: string) => Promise<boolean> | boolean
  multiline?: boolean
  /** Applied to both the text and the field, so they are the same size. */
  className?: string
  /** The accessible name of the field — "Title", "Description". */
  label: string
  /** Show the value only — no edit affordance. For a reader who cannot write. */
  readOnly?: boolean
}

export function EditableText({ value, placeholder, onCommit, multiline = false, className, label, readOnly = false }: EditableTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      fieldRef.current?.focus()
      fieldRef.current?.select()
    }
  }, [editing])

  const open = () => {
    setDraft(value)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value)
  }

  const commit = async () => {
    if (busy) return
    const next = draft.trim()
    if (next === value) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const ok = await onCommit(next)
      if (ok) setEditing(false)
    } catch {
      /* the caller has shown why; keep the field open */
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault()
      void commit()
    }
  }

  const fieldClass = cn(
    'w-full rounded-md border border-border-strong bg-bg-inset px-2 py-1 text-text-primary outline-none',
    multiline && 'resize-none',
    className,
  )

  if (readOnly) {
    return (
      <div
        aria-label={label}
        className={cn('w-full px-2 py-1', multiline && 'whitespace-pre-wrap', value ? 'text-text-primary' : 'text-text-muted', className)}
      >
        {value || placeholder}
      </div>
    )
  }

  if (editing) {
    return multiline ? (
      <textarea
        ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
        aria-label={label}
        value={draft}
        rows={4}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
        className={fieldClass}
      />
    ) : (
      <input
        ref={fieldRef as React.RefObject<HTMLInputElement>}
        aria-label={label}
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
        className={fieldClass}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      title="Click to edit"
      aria-label={`Edit ${label.toLowerCase()}`}
      className={cn(
        'w-full rounded-md border border-transparent px-2 py-1 text-left transition-colors hover:border-border-default',
        multiline && 'whitespace-pre-wrap',
        value ? 'text-text-primary' : 'text-text-muted',
        className,
      )}
    >
      {value || placeholder}
    </button>
  )
}
