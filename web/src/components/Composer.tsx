import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { browserDrafts, type DraftStore } from '@/lib/drafts'
import { Button } from '@/components/ui/Button'
import { WithTooltip } from '@/components/ui/Tooltip'
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
  /** Why nothing can be posted right now; disables the field and the button, shown as a tooltip. */
  disabledReason?: string
  /**
   * Where an unsent message belongs — CON-10. Built with `draftKeys`.
   *
   * Omitted means no draft is kept, which is the right answer for a composer
   * with no stable destination: a draft that cannot be keyed correctly is worse
   * than none, because it reappears somewhere it was not written.
   */
  draftKey?: string
  /** The store. Injected so a test needs no browser; defaults to `localStorage`. */
  drafts?: DraftStore
  className?: string
}

const KINDS = {
  conversation: { placeholder: 'Start a conversation…', label: 'Post', variant: 'primary' as const },
  reply: { placeholder: 'Reply…', label: 'Reply', variant: 'outlined' as const },
}

const DEFAULT_DRAFTS = browserDrafts()

export function Composer({ kind = 'conversation', onSubmit, autoFocus = false, disabledReason, draftKey, drafts = DEFAULT_DRAFTS, className }: ComposerProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  /*
    Seed from the draft, and re-seed when the destination changes — CON-10.

    Keyed on `draftKey` rather than run once on mount: this component is reused
    across threads as a list re-renders, so mounting is not the moment the
    destination changes. Doing it on mount alone is half of PEE-7 — the text
    from one thread staying visible in the next.

    `store` is held in a ref so a caller passing a fresh object each render
    cannot restart this effect and wipe what is being typed.
  */
  const store = useRef(drafts)
  store.current = drafts
  useEffect(() => {
    setText(draftKey ? (store.current.read(draftKey) ?? '') : '')
  }, [draftKey])

  const change = (next: string) => {
    setText(next)
    if (draftKey) store.current.write(draftKey, next)
  }
  const { placeholder, label, variant } = KINDS[kind]
  const canSubmit = text.trim().length > 0 && !busy && !disabledReason

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const ok = await onSubmit(text.trim())
      /*
        Cleared only when the relay took it. A refused publish keeps the text —
        losing a draft to a rejection is worse than never having had one, and
        `act` resolves false for exactly that case.
      */
      if (ok !== false) {
        setText('')
        if (draftKey) store.current.clear(draftKey)
      }
    } finally {
      setBusy(false)
    }
  }

  const button = (
    <Button type="submit" variant={variant} disabled={!canSubmit}>
      {label}
    </Button>
  )
  return (
    <form onSubmit={submit} className={cn('flex items-center gap-2', className)}>
      <TextInput
        value={text}
        onChange={(event) => change(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        disabled={busy || !!disabledReason}
        className="min-w-0 flex-1"
      />
      {disabledReason ? <WithTooltip label={disabledReason}>{button}</WithTooltip> : button}
    </form>
  )
}
