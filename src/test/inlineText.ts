/**
 * Typing into a title or a summary edited in place (the package's
 * `InlineText`) from a jsdom test.
 *
 * jsdom lays nothing out, so the editor gets empty rects when it scrolls to
 * the caret, and text goes in through the editor itself; focus and the keys
 * are real.
 */
import { act, fireEvent } from '@testing-library/react'
import type { Editor } from '@tiptap/core'

/** Call once per file, at the top: the rects the editor asks for. */
export function stubLayout() {
  const empty = () => [] as unknown as DOMRectList
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.getClientRects = empty
  Range.prototype.getClientRects = empty
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const editorOf = (box: HTMLElement) => (box as HTMLElement & { editor: Editor }).editor

/** Click into it and replace what it holds with `text`, as a person selecting all and typing does. */
export async function rewrite(box: HTMLElement, text: string) {
  await act(async () => {
    box.focus()
    const editor = editorOf(box)
    editor.commands.clearContent(true)
    if (text) editor.commands.insertContent(text)
  })
}

/** Click into it, the caret at the end, and type `text` after what is there. */
export async function typeAtEnd(box: HTMLElement, text: string) {
  await act(async () => {
    box.focus()
    const editor = editorOf(box)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent(text)
  })
}

/** Press a key in it: Enter, Escape. */
export async function press(box: HTMLElement, key: string) {
  await act(async () => {
    fireEvent.keyDown(box, { key })
  })
}

/** Leave it, as clicking elsewhere does. */
export async function leave(box: HTMLElement) {
  await act(async () => box.blur())
}
