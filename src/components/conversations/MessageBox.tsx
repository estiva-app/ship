import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { IconArrowUp, IconPaperclip } from '@tabler/icons-react'
import {
  blockDocumentToMarkerText,
  documentForEditing,
  fromEditorDocument,
  toEditorDocument,
  type EditorDocument,
  type Imeta,
} from '@estiva-app/protocol'
import { AttachmentCard, Avatar, Button, FieldLine, FilePicker, IconButton, Kbd, Toolbar, ToolbarButton, richTextClassName } from '@estiva-app/ui'
import { SelectionToolbar, isSuggestionActive, isSuggestionOpen, urgentPubkeys } from '@estiva-app/ui/editor'
import { subscribeReferences, type ReferenceSection } from '@/api/references'
import { cn } from '@/lib/cn'
import { browserDrafts, type DraftStore } from '@/lib/drafts'
import { uploadAttachment } from '@/api/blobs'
import { ReferenceNode, ReferenceProvider } from '@/components/ui/editorSchema'
import { LinkDecoration } from '@/components/editing/linkDecoration'
import { ShipSlashMenu, slashSections } from '@/components/editing/slashMenu'
import { chipsAsReferences, composerTriggers, urgentChipsFrom } from '@/components/editing/composerTriggers'
import { useMentionPeople } from '@/components/editing/mentionables'
import { WRITING_BOX } from './writingBox'


export type MessageBoxKind = 'conversation' | 'reply' | 'edit'

/** Production's words for the field, kept so a reader and a test find the same box. */
const LABEL: Record<MessageBoxKind, string> = { conversation: 'Start a conversation…', reply: 'Reply…', edit: 'Edit message' }

const DEFAULT_DRAFTS = browserDrafts()

/** What to call a file on its card. `filename` is what the sender attached. */
const fileName = (file: Imeta) => file.filename ?? file.alt ?? 'attachment'

const editorDocFor = (text: string) => toEditorDocument(documentForEditing(text, 'marker'))
// The chips first: the bridge drops an inline node it does not know (CON-25). A document with no blocks at all — an
// edit of a message that is only files starts as one — is no text; the bridge would throw on it.
const markerOf = (editor: Editor) => {
  const doc = editor.getJSON()
  return doc.content ? blockDocumentToMarkerText(fromEditorDocument(chipsAsReferences(doc as never) as EditorDocument)) : ''
}

/** What the text alone cannot say: which of the people it names were mentioned urgently (SPEC §13.1). */
export interface Picks {
  urgent?: readonly string[]
}

export interface MessageBoxProps {
  kind?: MessageBoxKind
  /** The trimmed marker text, the files already on the relay, and the urgent picks. Resolve `false` to keep them. */
  onSubmit: (text: string, files: readonly Imeta[], picks: Picks) => Promise<boolean | void> | boolean | void
  /** What `[` offers for what was typed — Messages then Files (PEE-21), asked as the query changes. Omitted, `[` opens nothing. */
  references?: (query: string) => readonly ReferenceSection[]
  /** Edit: the text as it stands. */
  initial?: string
  /** Edit: leave without saving. Reply: Escape in an empty box. */
  onCancel?: () => void
  autoFocus?: boolean
  disabledReason?: string
  draftKey?: string
  drafts?: DraftStore
  upload?: (file: File) => Promise<Imeta>
  nameOf?: (pubkey: string) => string
  /**
   * `box`: Peek's writing box. `bare`: no frame of its own, your face at the
   * start — for a reply inside a box that already frames it (option B, Linear's
   * layout). Only the look differs; every rule above is the same.
   */
  look?: 'box' | 'bare'
  /** Who is writing, for `bare`'s face. */
  me?: { name?: string; picture?: string }
  className?: string
}

/**
 * The writing box for conversations (Katerina, 29–30 September), on production's
 * rules. What it looks like is Peek's writing box; what it does is Ship's
 * `Composer` and `EditMessage`, rule for rule, so nothing production does is lost:
 *
 * - **What is sent is marker text** (SPEC §13.2), the same string the one-line
 *   field sends today. The editor's document goes through the block bridge
 *   (`fromEditorDocument`, then `blockDocumentToMarkerText`), so bold, italic,
 *   underline, code, headings, lists, quotes and a pasted reference survive, and
 *   an edit starts from the same text (`markerTextToBlockDocument`). `/` offers
 *   no Table: marker text has none.
 * - **`@`, `!@`, `[` and `/` are the package's** (CON-25): a person writes their
 *   `nostr:npub…`, a message its `nostr:nevent…`. The tags those earn are the
 *   caller's to add, from the text and the urgent picks `onSubmit` is handed.
 * - **A file uploads when it is picked**, one after another, and waits as the
 *   package's `AttachmentCard` with its ✕. A refusal shows in the relay's words
 *   under the box. Send waits while a file is uploading.
 * - **A message can be only files.** Nothing at all cannot be sent.
 * - **Cleared only when the relay took it.** `onSubmit` resolving `false` keeps
 *   the text and the files. Everything locks while it is sending.
 * - **Drafts** (CON-10): the text is kept per destination as it is typed, and
 *   comes back when the box is shown again. Files are not kept, as today.
 * - **Signed out:** `disabledReason` locks the box and every button, with the
 *   reason as the tooltip.
 * - **Keys:** Enter sends; Shift+Enter is Enter as a document has it (a new
 *   bullet, a new line in code, a new paragraph); Ctrl/Cmd+Enter also sends
 *   (today's edit shortcut). Escape: an edit cancels; an empty reply closes.
 *
 * A new conversation is Peek's tall box, the tools on a row under the text; a
 * reply is one short line with the tools at its end (Katerina, 30 September).
 */
export function MessageBox({ kind = 'conversation', onSubmit, references, initial = '', onCancel, autoFocus = false, disabledReason, draftKey, drafts = DEFAULT_DRAFTS, upload = uploadAttachment, nameOf, look = 'box', me, className }: MessageBoxProps) {
  const [text, setText] = useState(initial)
  const [files, setFiles] = useState<readonly Imeta[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const store = useRef(drafts)
  store.current = drafts
  const key = useRef(draftKey)
  key.current = draftKey
  // The lists are asked each time they open; the editor is built once, so they read the latest through refs.
  const mentionable = useMentionPeople()
  const people = useRef(mentionable)
  people.current = mentionable
  const offered = useRef(references)
  offered.current = references

  const unchanged = kind === 'edit' && text.trim() === initial.trim()
  const canSubmit = (text.trim().length > 0 || (kind !== 'edit' && files.length > 0)) && !unchanged && !busy && !uploading && !disabledReason
  const blocked = disabledReason || (uploading ? 'Uploading…' : busy ? 'Sending…' : undefined)

  // The key handlers are built once with the editor; they read the latest through refs.
  const submitRef = useRef<() => void>(() => {})
  const escapeRef = useRef<() => boolean>(() => false)
  const [keys] = useState(() =>
    Extension.create({
      name: 'messageBoxKeys',
      addKeyboardShortcuts() {
        /*
          "```" alone on its line, then Enter or Shift+Enter: a code block, as a
          document has it. Tiptap only turns "```" into one on a following space,
          and Enter here sends — so "```" went out as a message.
        */
        const fence = () => {
          const { $from, empty } = this.editor.state.selection
          if (!empty || $from.parent.type.name !== 'paragraph') return false
          const match = /^```([\w-]*)$/.exec($from.parent.textContent)
          if (!match) return false
          return this.editor.chain().deleteRange({ from: $from.start(), to: $from.end() }).setCodeBlock(match[1] ? { language: match[1] } : undefined).run()
        }
        const send = () => (isSuggestionActive() ? false : fence() || (submitRef.current(), true))
        /*
          Shift+Enter does what Enter does in a document, since Enter sends: a new
          bullet in a list (and out of the list from an empty one), a new line in
          code, a new paragraph anywhere else — ProseMirror's own Enter chain.
          It was a line break inside the same block, so "- a", Shift+Enter gave
          no second bullet (Katerina, 30 September).
        */
        const newBlock = () =>
          fence() ||
          this.editor.commands.first(({ commands }) => [
            () => commands.splitListItem('listItem'),
            () => commands.newlineInCode(),
            () => commands.createParagraphNear(),
            () => commands.liftEmptyBlock(),
            () => commands.splitBlock(),
          ])
        return { Enter: send, 'Mod-Enter': send, 'Shift-Enter': newBlock, Escape: () => escapeRef.current() }
      },
    }),
  )

  const editor = useEditor(
    {
      extensions: [
        // No trailing empty line after a list or a quote: in a document it lets you type below them, in a message it
        // made the box a line taller the moment a bullet appeared (Katerina, 30 September). Shift+Enter leaves a list.
        StarterKit.configure({ link: false, strike: false, heading: { levels: [1, 2] }, trailingNode: false }),
        ReferenceNode,
        LinkDecoration,
        ...composerTriggers({ people: () => people.current, references: (query) => offered.current?.(query) ?? [], subscribe: subscribeReferences }),
        // No Table: marker text has none (§13.2). No File in an edit, which keeps the message's files as they are.
        ShipSlashMenu(slashSections({ onFile: kind === 'edit' ? undefined : () => picker.current?.click(), triggers: true })),
        keys,
      ],
      content: editorDocFor(initial),
      editable: !disabledReason,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: { class: richTextClassName('default', 'outline-none'), role: 'textbox', 'aria-multiline': 'true', 'aria-label': LABEL[kind] },
      },
      onUpdate: ({ editor: e }) => {
        const next = markerOf(e)
        setText(next)
        // With whom it names urgently, which the text cannot say (CON-31).
        if (key.current) store.current.write(key.current, next, urgentPubkeys(e))
      },
    },
    [],
  )

  // Seed from the draft, and again when the destination changes (Composer's rule).
  useEffect(() => {
    if (!editor || editor.isDestroyed || kind === 'edit') return
    const seed = () => {
      const kept = draftKey ? store.current.readDraft(draftKey) : undefined
      const draft = kept?.text ?? ''
      // The urgent chips come back urgent: the text alone gives every person back as an ordinary reference (CON-31).
      const labelOf = (pubkey: string) => people.current.find((p) => p.pubkey === pubkey)?.name ?? `${pubkey.slice(0, 8)}…`
      const doc = urgentChipsFrom(editorDocFor(draft) as never, kept?.urgent, labelOf)
      editor.commands.setContent(doc as never, { emitUpdate: false })
      // A caret at the end, not the whole text selected: loading a draft left the line selected, and the formatting
      // strip showed on every reply box that opened (Katerina, 30 September).
      editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)))
      setText(draft)
      setFiles([])
      setUploadError(null)
    }
    // Loaded lazily, the editor can reach here before its view (and its commands) exist: seed once it is made.
    if (editor.isInitialized) seed()
    else editor.on('create', seed)
    return () => void editor.off('create', seed)
  }, [editor, draftKey, kind])

  // Locked while sending, which takes the caret away; after a send it goes back, ready for the next one.
  const sent = useRef(false)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const apply = () => {
      editor.setEditable(!disabledReason && !busy)
      if (!busy && sent.current) {
        sent.current = false
        editor.commands.focus()
      }
    }
    if (editor.isInitialized) apply()
    else editor.on('create', apply)
    return () => void editor.off('create', apply)
  }, [editor, disabledReason, busy])

  const submit = async () => {
    if (!canSubmit || !editor) return
    setBusy(true)
    try {
      const ok = await onSubmit(text.trim(), files, { urgent: urgentPubkeys(editor) })
      if (ok !== false) {
        if (kind === 'edit') return onCancel?.()
        editor.commands.clearContent()
        setText('')
        setFiles([])
        setUploadError(null)
        if (draftKey) store.current.clear(draftKey)
        sent.current = true
      }
    } finally {
      setBusy(false)
    }
  }
  submitRef.current = () => void submit()
  escapeRef.current = () => {
    // An open `@`, `[` or `/` list takes the first Escape and closes; this keymap runs before it (f586437a).
    if (isSuggestionOpen()) return false
    if (kind === 'edit') return (onCancel?.(), true)
    if (kind === 'reply' && !text.trim() && !files.length) return (onCancel?.(), true)
    editor?.commands.blur()
    return true
  }

  const choose = async (chosen: File[]) => {
    if (!chosen.length) return
    setUploading(true)
    setUploadError(null)
    try {
      // One after another: the first refusal is the one worth reporting (Composer).
      const added: Imeta[] = []
      for (const file of chosen) added.push(await upload(file))
      setFiles((held) => [...held, ...added])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error))
    } finally {
      setUploading(false)
      editor?.commands.focus()
    }
  }

  const field = (
    // A reply's first line is 24px, the buttons' height: 2px above and below the text, so the two sit level. A fixed
    // 2px rather than centring, because centring let go at the second line and the first jumped up 2px (Katerina,
    // 30 September: "the content above shifts a little, only on the first one").
    <div className={cn('relative w-full min-w-0', kind === 'reply' ? 'min-h-6 py-0.5' : 'min-h-5')}>
      <EditorContent editor={editor} />
      <SelectionToolbar editor={editor} marks={['bold', 'italic', 'underline', 'code']} />
      {!text && <Placeholder kind={kind} reason={disabledReason} />}
    </div>
  )

  const cards = files.length > 0 && (
    <ul data-composer="files" className="flex flex-wrap gap-2 pt-1">
      {files.map((file) => (
        <li key={file.x}>
          <AttachmentCard pending name={fileName(file)} size={file.size} contentType={file.m} onRemove={busy ? undefined : () => setFiles((held) => held.filter((f) => f.x !== file.x))} />
        </li>
      ))}
    </ul>
  )

  return (
    <ReferenceProvider value={{ resolved: {}, nameOf }}>
      <div className={cn('flex flex-col gap-1', className)} data-message-box={kind}>
        {kind === 'edit' ? (
          <div className={cn(WRITING_BOX, 'flex-col')}>
            {field}
            <div className="flex items-center gap-2">
              {/* Today's note, where an edit is made: a reader that has not implemented edits keeps showing the original. */}
              <span className="flex-1 text-caption text-text-muted">Publishes an edit; the original event stays on the relay.</span>
              <Button variant="outlined" size="small" onClick={() => onCancel?.()}>
                Cancel
              </Button>
              <Button variant="primary" size="small" disabled={!canSubmit} onClick={() => void submit()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          (() => {
            const attach = (
              <>
                <FilePicker ref={picker} multiple data-composer="picker" onPick={(chosen) => void choose(chosen)} />
                <Toolbar aria-label={kind === 'reply' ? 'Reply tools' : 'Compose tools'} surface={false} className="flex items-center">
                  <ToolbarButton tooltip="Attach a file" aria-label="Attach a file" disabledReason={blocked} onMouseDown={(e) => e.preventDefault()} onClick={() => picker.current?.click()}>
                    <IconPaperclip size={16} stroke={1.5} />
                  </ToolbarButton>
                </Toolbar>
              </>
            )
            const send = (
              <IconButton
                variant="primary"
                aria-label="Send"
                tooltip="Send"
                tooltipShortcut="Enter"
                disabled={!canSubmit}
                disabledReason={blocked}
                glow={canSubmit}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void submit()}
              >
                <IconArrowUp size={16} stroke={1.5} />
              </IconButton>
            )
            // A new conversation: Peek's tall box, the text on top and the tools on a row under it (Katerina, 30 September: "larger, like before").
            if (kind === 'conversation' && look === 'box') {
              return (
                <div className={cn(WRITING_BOX, 'flex-col gap-4')}>
                  {field}
                  {cards}
                  {/* Attach beside Send, at the right (Katerina, 30 September). */}
                  <div className="flex items-center justify-end gap-1">
                    {attach}
                    {send}
                  </div>
                </div>
              )
            }
            // A reply: one short line, the tools at its end (hers, the same day: "smaller in height").
            return (
              // 38px on one line — the height of estiva-ui's text field (37.6px, measured) — the 24px buttons and a 24px
              // text line, 6px above and below. More lines grow the box; the buttons stay at the bottom.
              <div className={cn(look === 'bare' ? 'flex items-end gap-2 py-1' : cn(WRITING_BOX, 'items-end py-1.5 pl-3 pr-1.5'))}>
                {look === 'bare' && <Avatar size={24} src={me?.picture} name={me?.name} className="mb-0.5 shrink-0 self-start" />}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {field}
                  {cards}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {attach}
                  {send}
                </div>
              </div>
            )
          })()
        )}
        {uploadError && <FieldLine tone="error">{uploadError}</FieldLine>}
      </div>
    </ReferenceProvider>
  )
}

/** What the empty box says; signed out, why nothing can be written here. */
function Placeholder({ kind, reason }: { kind: MessageBoxKind; reason?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-wrap items-center gap-1 text-body-2 text-text-muted">
      {reason ? (
        <span>{reason}</span>
      ) : kind === 'conversation' ? (
        <>
          <span>Start a conversation or type</span>
          <Kbd>/</Kbd>
          <span>for commands</span>
        </>
      ) : kind === 'reply' ? (
        <span>Reply…</span>
      ) : (
        <span>Edit message</span>
      )}
    </div>
  )
}

/** Loaded on first use (see ThreadList): the editor is its own chunk. */
export default MessageBox
