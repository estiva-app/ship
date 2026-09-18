import { useCallback, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { IconPaperclip } from '@tabler/icons-react'
import type { ContentFormat, Imeta } from '@estiva-app/protocol'
import { FieldLine, FilePicker } from '@estiva-app/ui'
import type { ForeignObject } from '@/api/foreign'
import { cn } from '@/lib/cn'
import { documentFor, publishableFrom, toEditorDocument, type EditorDocument } from '@/lib/blockEditor'
import { AttachmentNode, BlockId, ReferenceNode, ReferenceProvider, UnknownBlock } from './editorSchema'
import { uploadAttachment } from '@/api/blobs'
import { IconButton } from './IconButton'
import { PROSE_BLOCKS } from './prose'

/**
 * The writing half of {@link DescriptionEditor} — RIC-14.
 *
 * **Its own module so it can be its own chunk.** ProseMirror plus the schema
 * is 128 kB gzipped, which is more than the whole app was, and most people
 * open an issue to read it. So the reading surface never loads this and the
 * first click does; `DescriptionEditor` renders the reading surface as the
 * suspense fallback, which is the same pixels, so the wait is invisible rather
 * than a spinner where the text was.
 */
export default function DescriptionEditing({
  value,
  format,
  onCommit,
  onLeave,
  nameOf,
  resolved,
  upload = uploadAttachment,
}: {
  value: string
  format: ContentFormat
  /** Resolve `true` when saved; `false` keeps the editor open with the text. */
  onCommit: (value: string, contentFormat?: string) => Promise<boolean> | boolean
  /** The upload. Injected so a test and a story need no relay — see `Composer`. */
  upload?: (file: File) => Promise<Imeta>
  /** Saved, or reverted — either way this surface is done. */
  onLeave: () => void
  nameOf?: (pubkey: string) => string
  resolved: Record<string, ForeignObject | null | undefined>
}) {
  /*
    A commit is reached from two directions — blur, and Escape's revert — and
    the editor's own `onBlur` fires while a commit started by something else is
    still in flight. Without this the same document is published twice.
  */
  const committing = useRef(false)
  const picker = useRef<HTMLInputElement>(null)
  /*
    True from the moment the file dialog is asked for until the window comes
    back — see `openPicker`. While it is set, a blur does **not** commit.
  */
  const picking = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const failed = useRef(false)

  const finish = useCallback(
    async (editor: Editor, save: boolean) => {
      if (committing.current) return
      committing.current = true
      try {
        if (!save) {
          onLeave()
          return
        }
        const next = publishableFrom(editor.getJSON() as EditorDocument)
        // Nothing changed: leaving is not a write. `EditableText`'s rule, kept.
        if (next.value === value) {
          onLeave()
          return
        }
        const ok = await onCommit(next.value, next.contentFormat)
        // A commit that fails keeps the surface open with the text in it, so an
        // edit is never silently lost — the caller has already said why.
        failed.current = !ok
        if (ok) onLeave()
      } finally {
        committing.current = false
      }
    },
    [onCommit, onLeave, value],
  )

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          /*
            Two marks the wire format does not have (SPEC §13.1 is bold,
            italic, underline, code and reference). An editor that can produce
            what the format cannot carry is an editor that loses work on save,
            so the keystroke is removed rather than the result dropped later.
          */
          link: false,
          strike: false,
          // §13.3 validates a heading at 1–3 and rejects anything else.
          heading: { levels: [1, 2, 3] },
        }),
        BlockId,
        ReferenceNode,
        UnknownBlock,
        AttachmentNode,
      ],
      content: toEditorDocument(documentFor(value, format)),
      // The caret at the end of what is there, rather than selecting a long
      // body — the failure mode of `autofocus: true`.
      autofocus: 'end',
      editorProps: {
        attributes: {
          // The editor is the field, so it carries the field's name.
          'aria-label': 'Description',
          role: 'textbox',
          'aria-multiline': 'true',
          class: cn(PROSE_BLOCKS, 'outline-none'),
        },
      },
      /*
        Blur commits — except while the file dialog is open.

        **This is SHI-2's bug.** Opening a native file dialog takes focus off
        the page, and the browser fires `blur` on the editor. The description
        then saved and closed *while the person was still choosing a file*, the
        upload resolved into an unmounted editor, and the guard in `attach`
        dropped the insert without a word. Production showed it plainly: three
        description changes in twenty-five seconds, none carrying an
        attachment.

        `preventDefault` on the button's mousedown was not enough — it stops
        the *button* taking focus, and the dialog is what actually takes it. A
        Playwright repro cannot see this either, because it intercepts the file
        chooser and no native dialog ever opens.
      */
      onBlur: ({ editor: e }) => {
        if (picking.current) return
        void finish(e, true)
      },
    },
    [value, format],
  )

  /*
    Attaching a file — SHI-2.

    **The control must not take focus.** This editor commits on blur, so an
    ordinary button would save and close the description the moment it was
    pressed, and the file would arrive with nowhere to go. `preventDefault` on
    mousedown keeps the caret in ProseMirror, which is why the insert lands
    where the person was typing.

    The upload happens before the block is inserted, for the same reason it does
    in the composer: §13.3's `attrs` are the relay's own answers about the blob,
    and there is nothing to write until it has them.
  */
  /**
   * Ask for a file, without letting the dialog close the description.
   *
   * The flag is cleared when the window comes back rather than on `change`: a
   * cancelled dialog fires no event at all, so `change` alone would leave the
   * editor unable to commit on blur for the rest of its life.
   */
  const openPicker = () => {
    picking.current = true
    const released = () => {
      picking.current = false
      window.removeEventListener('focus', released)
    }
    window.addEventListener('focus', released)
    picker.current?.click()
  }

  const attach = async (chosen: File[]) => {
    if (chosen.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      for (const file of chosen) {
        const meta = await upload(file)
        // The editor can be gone by now — a slow upload outlives a description
        // the person closed. Inserting into a destroyed editor throws, and the
        // file is simply not attached, which is the honest outcome.
        if (!editor || editor.isDestroyed) return
        editor.chain().focus().insertContent({ type: 'attachment', attrs: { ...meta } }).run()
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error))
    } finally {
      // FilePicker has already cleared itself, so the same file can be chosen again.
      setUploading(false)
    }
  }

  return (
    <ReferenceProvider value={{ resolved, nameOf }}>
      <div className="flex flex-col gap-1">
        <EditorContent
          editor={editor}
          /*
            The reading surface's own `-mx-2 px-2 py-1`, so the text does not
            move when it becomes editable. That, and the absence of a fixed
            height, is most of what "1:1" means in practice — the four-row
            textarea this replaces moved everything and hid most of it.
          */
          className="-mx-2 rounded-md bg-bg-wash px-2 py-1"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !editor) return
            event.preventDefault()
            event.stopPropagation()
            void finish(editor, false)
          }}
        />
        <div className="flex items-center gap-2">
          <FilePicker ref={picker} multiple data-description="picker" onPick={(files) => void attach(files)} />
          <IconButton
            variant="muted"
            aria-label="Attach a file to the description"
            tooltip="Attach a file"
            disabledReason={uploading ? 'Uploading…' : undefined}
            // See `attach`: taking focus here would commit and close the editor.
            onMouseDown={(event) => event.preventDefault()}
            onClick={openPicker}
          >
            <IconPaperclip size={16} stroke={1.5} />
          </IconButton>
        </div>
        {/* The package's FieldLine: the same line, and it says "error" itself (UIG-8). */}
        {uploadError && <FieldLine tone="error">{uploadError}</FieldLine>}
        {failed.current && <FieldLine tone="error">Could not save. Your text is still here.</FieldLine>}
      </div>
    </ReferenceProvider>
  )
}
