import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'

/**
 * Ship's composer, as production has it: one line and a button. A form, so
 * Enter submits; the button is disabled while a post is in flight; the field
 * clears only when the post succeeded (the caller says so by resolving).
 *
 * Ship-only, by Katerina's ruling (2026-08-26): Ship's conversations are a
 * different concept from Peek's rich composer, at least for now, so this is
 * not a port of Peek's ComposeBox. Built from the shared parts — TextInput
 * and Button — so it still looks like Estiva.
 *
 * Two kinds, both from today's app: `conversation` starts one ("Start a
 * conversation…" / Post, primary) and `reply` answers one ("Reply…" / Reply).
 */
export interface ComposerProps {
  kind?: 'conversation' | 'reply'
  /** Called with the trimmed text; resolve to clear the field, reject or resolve `false` to keep it. */
  onSubmit: (text: string) => Promise<boolean | void> | boolean | void
  autoFocus?: boolean
  className?: string
}

const KINDS = {
  conversation: { placeholder: 'Start a conversation…', label: 'Post', variant: 'primary' as const },
  reply: { placeholder: 'Reply…', label: 'Reply', variant: 'outlined' as const },
}

export function Composer({ kind = 'conversation', onSubmit, autoFocus = false, className }: ComposerProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const { placeholder, label, variant } = KINDS[kind]
  const canSubmit = text.trim().length > 0 && !busy

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const ok = await onSubmit(text.trim())
      if (ok !== false) setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={cn('flex items-center gap-2', className)}>
      <TextInput
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        disabled={busy}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant={variant} disabled={!canSubmit}>
        {label}
      </Button>
    </form>
  )
}
