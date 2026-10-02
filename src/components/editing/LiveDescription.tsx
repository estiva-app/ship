import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TextSelection } from '@tiptap/pm/state'
import {
  documentForEditing,
  publishableFromEditor,
  toEditorDocument,
  type ContentFormat,
  type EditorDocument,
  type Imeta,
} from '@estiva-app/protocol'
import { FieldLine, FilePicker, richTextClassName } from '@estiva-app/ui'
import { SelectionToolbar } from '@estiva-app/ui/editor'
import { uploadAttachment } from '@/api/blobs'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { AttachmentNode, BlockId, ReferenceNode, ReferenceProvider, UnknownBlock } from '@/components/ui/editorSchema'
import { LinkDecoration } from './linkDecoration'
import { ShipSlashMenu, slashSections } from './slashMenu'

/**
 * The description as one surface that is always an editor (Katerina,
 * 29 September: findings E3–E6), replacing `DescriptionEditor` +
 * `DescriptionEditing`:
 *
 * - **No reading/writing switch.** The editor is there from the start, so a
 *   click lands in it and the caret goes where you clicked. No box, no fill,
 *   no row of buttons: attach and table are in the `/` menu (the package's
 *   `SuggestionMenu`), bold, italic, underline and code in the package's
 *   selection toolbar, and links are drawn while you type.
 * - **Saves when you leave:** on blur, and on unmount — switching tab or
 *   leaving the page. Never while typing: each save is a line in History.
 *   Escape leaves and keeps the text (Notion's Esc). A refused save keeps the
 *   text and says so.
 * - **Someone else's edit arrives** while you are not in it: it is loaded. While
 *   you are typing it waits, and your own save coming back is never mistaken for
 *   someone else's (Peek's RIC-13 lesson: an echo of your own edit must not
 *   overwrite newer text).
 *
 * Kept from `DescriptionEditing`: the block ids and unknown blocks that let
 * comments stay anchored (§13.6), tables, attachments uploaded before they are
 * inserted, the file dialog not counting as leaving, and the format tag the
 * editor built the document in (RIC-14).
 */
export function LiveDescription({
  value,
  format,
  onCommit,
  nameOf,
  resolved = {},
  onEditor,
  upload = uploadAttachment,
}: {
  value: string
  format: ContentFormat
  onCommit: (value: string, contentFormat?: string) => Promise<boolean> | boolean
  nameOf?: (pubkey: string) => string
  /** The description's references, resolved once by the page — RIC-10. */
  resolved?: Record<string, ForeignObjectData | null | undefined>
  /** Hands the editor up, so the title's Enter can move the caret here. */
  onEditor?: (editor: Editor | null) => void
  upload?: (file: File) => Promise<Imeta>
}) {
  const [failed, setFailed] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  /*
    True from the moment the file dialog is asked for until the window comes
    back: the dialog takes focus, and a blur then must not save and leave
    (SHI-2, DescriptionEditing's own guard).
  */
  const picking = useRef(false)
  const openPicker = () => {
    picking.current = true
    const released = () => {
      picking.current = false
      window.removeEventListener('focus', released)
    }
    window.addEventListener('focus', released)
    picker.current?.click()
  }
  const [empty, setEmpty] = useState(value.trim() === '')
  const committing = useRef(false)
  // The last value saved or loaded, so a blur with nothing new is not a write and
  // our own save coming back is not someone else's edit.
  const saved = useRef(value)
  // The text as last typed. Saving on the way out reads this, not the editor,
  // which may already be torn down by then.
  const typed = useRef<EditorDocument | null>(null)

  const save = useCallback(
    async (doc: EditorDocument | null) => {
      if (committing.current || !doc) return
      const next = publishableFromEditor(doc)
      if (next.value === saved.current) return
      committing.current = true
      try {
        const ok = await onCommit(next.value, next.contentFormat)
        setFailed(!ok)
        if (ok) saved.current = next.value
      } finally {
        committing.current = false
      }
    },
    [onCommit],
  )
  /*
    The latest `save`, for the editor's `onBlur` (created once) and the unmount
    below. A cleanup keyed on `save` ran on every render a page's inline
    `onDescribe` caused, publishing mid-typing (MAN-9, found in Peek's copy).
  */
  const latestSave = useRef(save)
  useEffect(() => {
    latestSave.current = save
  }, [save])

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false, strike: false, heading: { levels: [1, 2, 3] } }),
        TableKit.configure({ table: { resizable: false } }),
        BlockId,
        ReferenceNode,
        UnknownBlock,
        AttachmentNode,
        LinkDecoration.configure({ openOnClick: true }),
        ShipSlashMenu(slashSections({ table: true, onFile: () => openPicker() })),
      ],
      // Built once. A value coming back must not rebuild the editor under the caret; see the effect below.
      content: toEditorDocument(documentForEditing(value, format)),
      editorProps: {
        attributes: { 'aria-label': 'Description', role: 'textbox', 'aria-multiline': 'true', class: richTextClassName('default', 'outline-none') },
        handleKeyDown: (view, event) => {
          if (event.key !== 'Escape') return false
          const { selection, tr } = view.state
          // Words selected: the first Escape lets go of them, which also closes
          // the formatting strip. Blurring with the strip open does not work —
          // the closing Popover hands focus straight back.
          if (!selection.empty) {
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, selection.to)))
            return true
          }
          view.dom.blur()
          return true
        },
      },
      onUpdate: ({ editor: e }) => {
        typed.current = e.getJSON() as EditorDocument
        setEmpty(e.isEmpty)
      },
      onBlur: () => {
        if (picking.current) return
        void latestSave.current(typed.current)
      },
    },
    [],
  )

  // Someone else's edit: loaded while you are not in the field; your own save coming back is left alone.
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === saved.current || editor.isFocused || committing.current) return
    editor.commands.setContent(toEditorDocument(documentForEditing(value, format)), { emitUpdate: false })
    saved.current = value
    typed.current = null
    setEmpty(value.trim() === '')
  }, [editor, value, format])

  /* `/` File: the upload first, then the block — its attributes are the relay's answers (SHI-2). */
  const attach = async (chosen: File[]) => {
    setUploadError(null)
    try {
      for (const file of chosen) {
        const meta = await upload(file)
        if (!editor || editor.isDestroyed) return
        editor.chain().focus().insertContent({ type: 'attachment', attrs: { ...meta } }).run()
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  // Leaving the tab or the page unmounts this: save on the way out.
  useEffect(() => () => void latestSave.current(typed.current), [])

  return (
    <ReferenceProvider value={{ resolved, nameOf }}>
      <div className="flex flex-col gap-1">
        {/* The reading surface's own `-mx-2 px-2 py-1`, so nothing moves. The text cursor is the only sign it is editable. */}
        <div className="relative">
          <EditorContent editor={editor} className="-mx-2 cursor-text px-2 py-1" data-description="editing" />
          {/* Peek's composer pattern: muted words over an empty editor. */}
          {empty && <span aria-hidden className="pointer-events-none absolute left-0 top-1 text-body-2 text-text-muted">Add a description…</span>}
        </div>
        <SelectionToolbar editor={editor} marks={['bold', 'italic', 'underline', 'code']} />
        <FilePicker ref={picker} multiple onPick={(files) => void attach(files)} />
        {uploadError && <FieldLine tone="error">{uploadError}</FieldLine>}
        {failed && <FieldLine tone="error">Could not save. Your text is still here.</FieldLine>}
      </div>
    </ReferenceProvider>
  )
}
