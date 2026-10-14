import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TextSelection } from '@tiptap/pm/state'
import {
  documentForEditing,
  publishableFromEditor,
  referenceOfLink,
  toEditorDocument,
  type ContentFormat,
  type EditorDocument,
  type Imeta,
} from '@estiva-app/protocol'
import { FieldLine, FilePicker, richTextClassName } from '@estiva-app/ui'
import { Callout, Checklist, CodeBlockColours, EditorBlockHandle, LinkChips, PastedImages, ReferenceCards, SelectionToolbar, blockDropCursor, isChecklistTick, isSuggestionOpen } from '@estiva-app/ui/editor'
import { uploadAttachment } from '@/api/blobs'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { askLinkValues, knownLinkValue } from '@/api/linkCards'
import { AttachmentNode, BlockId, ReferenceNode, ReferenceProvider, UnknownBlock } from '@/components/ui/editorSchema'
import { LinkDecoration } from './linkDecoration'
import { blockRows } from './blockRows'
import { CardChoice, EditorLineCards, useChipObjects } from './DescriptionCards'
import { ShipSlashMenu, TURN_INTO, slashSections } from './slashMenu'

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
  onCommentOnBlock,
  onCopyBlockLink,
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
  /** The block menu's Comment: start a conversation anchored to that block. Without it the row is not offered. */
  onCommentOnBlock?: (blockId: string) => void
  /** The block menu's Copy link: the page's copy, which confirms it. */
  onCopyBlockLink?: (link: string) => void
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
  // Where a pasted picture goes: `attach`, set below once it exists.
  const pasteTo = useRef<((files: File[]) => Promise<void>) | null>(null)
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
  const again = useRef(false)

  const save = useCallback(
    async (doc: EditorDocument | null) => {
      if (!doc) return
      // A change made while a save is out — a block menu's Delete right after the press that blurred the field — goes next, not nowhere.
      if (committing.current) {
        again.current = true
        return
      }
      const next = publishableFromEditor(doc)
      if (next.value === saved.current) return
      committing.current = true
      try {
        const ok = await onCommit(next.value, next.contentFormat)
        setFailed(!ok)
        if (ok) saved.current = next.value
      } finally {
        committing.current = false
        // In `finally`, so a commit that throws still hands on the change waiting behind it.
        if (again.current) {
          again.current = false
          void latestSave.current(typed.current)
        }
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
        // The drop line in the accent, where a dragged block will land (RIC-18, Katerina's review).
        // The code block is the package's, coloured by language as it is when read (estiva-ui 0.64.0).
        StarterKit.configure({ link: false, strike: false, heading: { levels: [1, 2, 3] }, dropcursor: blockDropCursor, codeBlock: false }),
        CodeBlockColours,
        TableKit.configure({ table: { resizable: false } }),
        BlockId,
        // A checklist item and a callout (RIC-19); without them a save drops the tick and the tone.
        Checklist,
        Callout,
        ReferenceNode,
        // The card a chip asks for, after its line (SPEC §13.3); drawn by `EditorLineCards` below.
        ReferenceCards,
        // An app URL reads as the chip of what it names, and saves as the URL (Widgets, Miky 14 Oct).
        LinkChips.configure({ referenceOf: (url) => referenceOfLink(url, knownLinkValue), ask: askLinkValues }),
        UnknownBlock,
        AttachmentNode,
        LinkDecoration.configure({ openOnClick: true }),
        ShipSlashMenu(slashSections({ table: true, onFile: () => openPicker() })),
        // A pasted picture is placed as `/` File places one (Katerina, 8 October); text on the clipboard stays text.
        PastedImages.configure({
          onImages: (pasted) => {
            const take = pasteTo.current
            if (!take) return false
            void take(pasted)
            return true
          },
        }),
      ],
      // Built once. A value coming back must not rebuild the editor under the caret; see the effect below.
      content: toEditorDocument(documentForEditing(value, format)),
      editorProps: {
        attributes: { 'aria-label': 'Description', role: 'textbox', 'aria-multiline': 'true', class: richTextClassName('default', 'outline-none') },
        handleKeyDown: (view, event) => {
          if (event.key !== 'Escape') return false
          // An open `/` list closes first; the next Escape leaves (e33e9a4f, as the message box since f586437a).
          if (isSuggestionOpen()) return false
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
      onUpdate: ({ editor: e, transaction }) => {
        typed.current = e.getJSON() as EditorDocument
        setEmpty(e.isEmpty)
        // A click on a box does not focus the field, so no blur will save it: one click ticks, and is saved (RIC-19, Miky 2026-10-13).
        if (isChecklistTick(transaction)) void latestSave.current(typed.current)
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
  pasteTo.current = attach

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  // Leaving the tab or the page unmounts this: save on the way out.
  useEffect(() => () => void latestSave.current(typed.current), [])

  const chips = useChipObjects(editor, resolved)

  return (
    <ReferenceProvider value={{ resolved: chips, nameOf }}>
      <div className="flex flex-col gap-1">
        {/* The reading surface's own `-mx-2 px-2 py-1`, so nothing moves. The text cursor is the only sign it is editable. */}
        {/* The handle sits in the gutter left of the text, so nothing moves (RIC-18). */}
        <EditorBlockHandle editor={editor} turnInto={TURN_INTO} actions={blockRows(onCommentOnBlock, onCopyBlockLink)}>
          <EditorContent editor={editor} className="-mx-2 cursor-text px-2 py-1" data-description="editing" />
          {/* Peek's composer pattern: muted words over an empty editor. */}
          {empty && <span aria-hidden className="pointer-events-none absolute left-0 top-1 text-body-2 text-text-muted">Add a description…</span>}
        </EditorBlockHandle>
        <EditorLineCards editor={editor} resolved={chips} />
        <SelectionToolbar editor={editor} marks={['bold', 'italic', 'underline', 'code']}>
          <CardChoice editor={editor} />
        </SelectionToolbar>
        <FilePicker ref={picker} multiple onPick={(files) => void attach(files)} />
        {uploadError && <FieldLine tone="error">{uploadError}</FieldLine>}
        {failed && <FieldLine tone="error">Could not save. Your text is still here.</FieldLine>}
      </div>
    </ReferenceProvider>
  )
}
