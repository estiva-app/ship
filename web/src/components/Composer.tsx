import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import type { Imeta } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'
import { browserDrafts, type DraftStore } from '@/lib/drafts'
import { uploadAttachment } from '@/api/blobs'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { InputChip } from '@/components/ui/InputChip'
import { TextInput } from '@/components/ui/TextInput'

/**
 * Ship's composer, as production has it: one line, an attach button and a
 * post button. A form, so Enter submits; the buttons are disabled while a post
 * is in flight; the field clears only when the post succeeded (the caller says
 * so by resolving).
 *
 * Ship-only, by Katerina's ruling (2026-08-26): Ship's conversations are a
 * different concept from Peek's rich composer, at least for now, so this is
 * not a port of Peek's ComposeBox. Built from the shared parts — TextInput,
 * Button and IconButton — so it still looks like Estiva. SHI-2 is why there is
 * a third control and not a fourth: attaching a file is the whole of what was
 * asked for.
 *
 * Two kinds, both from today's app: `conversation` starts one ("Start a
 * conversation…" / Post, primary) and `reply` answers one ("Reply…" / Reply).
 *
 * ## The upload happens on choosing the file, not on posting
 *
 * Ingest runs `verify_imeta_blobs` and refuses a message naming a blob the
 * relay does not already hold, so the bytes have to land first either way.
 * Doing it at selection means the wait and any refusal — too large, a type the
 * relay will not take — arrive while the person is still writing, attached to
 * the file they just chose. Doing it at submit would spend the same seconds
 * after they pressed Post and report the failure as a failure to post.
 *
 * The cost is that abandoning a half-written message leaves an unreferenced
 * blob on the relay. It is content-addressed and nothing points at it; the
 * alternative was showing a chip for a file that might still turn out to be
 * unpostable, which is worse to read.
 *
 * Attachments are **not** kept in the draft (CON-10). The store holds a string
 * per key, and a chip restored beside text that no longer mentions it is a
 * claim about a message nobody wrote.
 */
export interface ComposerProps {
  kind?: 'conversation' | 'reply'
  /**
   * Called with the trimmed text and the files already on the relay. Resolve to
   * clear the field, reject or resolve `false` to keep it.
   */
  onSubmit: (text: string, files: readonly Imeta[]) => Promise<boolean | void> | boolean | void
  autoFocus?: boolean
  /** Why nothing can be posted right now; disables the field and the buttons, shown as a tooltip. */
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
  /** The upload. Injected for the same reason as `drafts` — a test and a story need no relay. */
  upload?: (file: File) => Promise<Imeta>
  className?: string
}

const KINDS = {
  conversation: { placeholder: 'Start a conversation…', label: 'Post', variant: 'primary' as const },
  reply: { placeholder: 'Reply…', label: 'Reply', variant: 'outlined' as const },
}

const DEFAULT_DRAFTS = browserDrafts()

/** What to call a file on its chip. `filename` is what the sender attached. */
const nameOf = (file: Imeta) => file.filename ?? file.alt ?? 'attachment'

export function Composer({ kind = 'conversation', onSubmit, autoFocus = false, disabledReason, draftKey, drafts = DEFAULT_DRAFTS, upload = uploadAttachment, className }: ComposerProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<readonly Imeta[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

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
    // Files belong to the message being written, and the destination just
    // changed — so they belong to a message that is no longer being written.
    setFiles([])
    setUploadError(null)
  }, [draftKey])

  const change = (next: string) => {
    setText(next)
    if (draftKey) store.current.write(draftKey, next)
  }
  const { placeholder, label, variant } = KINDS[kind]
  // A message that is only an image is a message. What cannot be posted is one
  // that is nothing at all.
  const canSubmit = (text.trim().length > 0 || files.length > 0) && !busy && !uploading && !disabledReason

  const choose = async (chosen: FileList | null) => {
    if (!chosen || chosen.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      /*
        Sequential, not `Promise.all`. Each upload is a signed authorization
        followed by the bytes, and the first refusal is the one worth reporting
        — parallelising would spend the whole selection's bandwidth to arrive at
        the same message, and the relay's words are about one file.
      */
      const added: Imeta[] = []
      for (const file of Array.from(chosen)) added.push(await upload(file))
      setFiles((held) => [...held, ...added])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error))
    } finally {
      setUploading(false)
      // Let the same file be chosen again after a failure, or after removing it.
      if (picker.current) picker.current.value = ''
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const ok = await onSubmit(text.trim(), files)
      /*
        Cleared only when the relay took it. A refused publish keeps the text —
        losing a draft to a rejection is worse than never having had one, and
        `act` resolves false for exactly that case. The files are kept for the
        same reason: they are already uploaded, so a retry costs nothing.
      */
      if (ok !== false) {
        setText('')
        setFiles([])
        setUploadError(null)
        if (draftKey) store.current.clear(draftKey)
      }
    } finally {
      setBusy(false)
    }
  }

  const blocked = disabledReason || (uploading ? 'Uploading…' : undefined)

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2">
        <TextInput
          value={text}
          onChange={(event) => change(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          disabled={busy || !!disabledReason}
          className="min-w-0 flex-1"
        />
        {/* The button is the control; this is the mechanism behind it. Hidden
            from the accessibility tree on purpose — two things both named
            "Attach a file" is one more than a screen reader should find, and
            a `display:none` input still opens its picker on a scripted click. */}
        <input
          ref={picker}
          type="file"
          multiple
          data-composer="picker"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => void choose(event.target.files)}
        />
        <IconButton
          variant="muted"
          aria-label="Attach a file"
          tooltip="Attach a file"
          disabledReason={busy ? 'Posting…' : blocked}
          onClick={() => picker.current?.click()}
        >
          <IconPaperclip size={16} stroke={1.5} />
        </IconButton>
        <Button type="submit" variant={variant} disabled={!canSubmit} disabledReason={blocked}>
          {label}
        </Button>
      </div>

      {/* `InputChip`, the package's own removable chip — exported on its own
          (Katerina, 2026-09-01) "under a name that promises nothing about
          people: a chip like this may one day hold a label, a file, a filter".
          It draws the ✕ and names it `Remove <label>`, which is what several
          attachments need: one control per file, each saying which. */}
      {files.length > 0 && (
        <ul data-composer="files" className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <li key={file.x}>
              <InputChip
                label={nameOf(file)}
                leading={<IconPaperclip size={16} stroke={1.5} />}
                onRemove={() => setFiles((held) => held.filter((f) => f.x !== file.x))}
              />
            </li>
          ))}
        </ul>
      )}

      {/* The relay's own words. A refusal here is usually about the file — too
          large, a type it will not take — which is something to act on. */}
      {uploadError && (
        <p data-composer="upload-error" role="alert" className="text-caption text-error-default">
          {uploadError}
        </p>
      )}
    </form>
  )
}
