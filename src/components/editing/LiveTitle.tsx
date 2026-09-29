import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions'
import { cn } from '@/lib/cn'

/**
 * A title that is always editable, with no box — Katerina,
 * 29 September 2026 (findings E1, E2; question 5).
 *
 * - **No box** on hover or on click (E1, E2). The text cursor is the only sign.
 * - **The caret goes where you click**, and nothing is selected (E2).
 * - **Enter moves you into the description** — Linear's behaviour ("pressing
 *   Enter from the sub-issue title … move[s] to the description field",
 *   changelog 30 June 2022).
 * - **Escape stops editing and keeps the text** — Notion's help: Esc takes you
 *   out of typing. Nothing is thrown away; Ctrl+Z undoes.
 * - **Saves when you leave:** blur, Enter, Escape. An unchanged title is not a write,
 *   and neither is an empty one: leaving it empty brings the last saved title back.
 *
 * One paragraph and no marks — a title is plain text, and it wraps like one,
 * which a one-line `<input>` cannot. A Tiptap editor rather than a raw
 * `contenteditable`, so it is the same kind of surface as the description.
 */
const OneLine = Document.extend({ content: 'paragraph' })

export function LiveTitle({
  value,
  placeholder,
  onCommit,
  onEnter,
  readOnly = false,
  className,
}: {
  value: string
  placeholder: string
  onCommit: (value: string) => Promise<boolean> | boolean
  /** Enter: where the caret goes next — the description. */
  onEnter?: () => void
  readOnly?: boolean
  className?: string
}) {
  const saved = useRef(value)
  // Peek's composer pattern: the placeholder follows the text as it is typed
  // or deleted, not the saved value.
  const [empty, setEmpty] = useState(!value)
  // Read at key time: the editor's key handler is built once, and a prop it
  // closed over would be the first render's (the description not yet there).
  const enter = useRef(onEnter)
  enter.current = onEnter

  const save = useCallback(async (text: string) => {
    const next = text.replace(/\s+/g, ' ').trim()
    if (!next || next === saved.current) return
    if (await onCommit(next)) saved.current = next
  }, [onCommit])

  const editor = useEditor({
    extensions: [OneLine, Paragraph, Text, UndoRedo],
    content: { type: 'doc', content: [{ type: 'paragraph', content: value ? [{ type: 'text', text: value }] : [] }] },
    editable: !readOnly,
    editorProps: {
      attributes: { 'aria-label': 'Title', role: 'textbox', class: 'outline-none' },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void save(view.state.doc.textContent)
          enter.current?.()
          return true
        }
        if (event.key === 'Escape') {
          view.dom.blur()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => setEmpty(e.isEmpty),
    onBlur: ({ editor: e }) => {
      // Left empty: the last saved title comes back, so the page never shows
      // "Untitled" while everyone else still sees the old name.
      if (e.isEmpty && saved.current) {
        e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: saved.current }] }] })
        setEmpty(false)
        return
      }
      void save(e.getText())
    },
  }, [readOnly])

  // A rename made elsewhere is loaded while you are not in the title; our own save coming back is left alone.
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === saved.current || editor.isFocused) return
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: value ? [{ type: 'text', text: value }] : [] }] }, { emitUpdate: false })
    saved.current = value
    setEmpty(!value)
  }, [editor, value])

  return (
    <div className={cn('relative', className)}>
      <EditorContent editor={editor} className={cn('-mx-2 px-2 py-1 text-text-primary', !readOnly && 'cursor-text')} />
      {/* Empty — never saved, or just deleted — shows what it is for, muted,
          and is not part of the text. Drawn over the editor, as Peek does. */}
      {empty && (
        <span aria-hidden className="pointer-events-none absolute left-0 top-1 text-text-muted">{placeholder}</span>
      )}
    </div>
  )
}
