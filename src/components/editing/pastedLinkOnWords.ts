import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * A URL pasted over selected words is a link on those words — OPT-19 (Miky,
 * 14 Oct: "a URL over selected words stays a link on them").
 *
 * Ship's editors have no link mark: marker text writes none (§13.1's
 * `[label](url)` is text to it), so the words become `[words](url)`, which
 * `LinkDecoration` draws as a link while writing and every reader draws as one.
 * `LinkChips` never makes that a chip: a link on words is the author's.
 *
 * Only a clipboard that is one URL, over words on one line with no chip in
 * them and no bracket that would end the label early; anything else pastes as
 * it always did.
 */
export const PastedLinkOnWords = Extension.create({
  name: 'pastedLinkOnWords',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pastedLinkOnWords'),
        props: {
          handlePaste: (view, event) => {
            const url = loneUrl(event.clipboardData?.getData('text/plain') ?? '')
            const { selection } = view.state
            if (!url || selection.empty || !selection.$from.sameParent(selection.$to)) return false
            if (selection.$from.parent.type.spec.code) return false
            const words = view.state.doc.textBetween(selection.from, selection.to)
            // A chip in the words has no text here, and a bracket or a line would end the label.
            if (!words.trim() || /[[\]\n]/.test(words) || words.length !== selection.to - selection.from) return false
            const code = view.state.schema.marks.code
            if (code && view.state.doc.rangeHasMark(selection.from, selection.to, code)) return false
            view.dispatch(view.state.tr.insertText(`[${words}](${url})`, selection.from, selection.to).scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})

/** The one http(s) URL a clipboard holds, or null when it holds anything else. */
export function loneUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!/^https?:\/\/[^\s()[\]]+$/i.test(trimmed)) return null
  try {
    new URL(trimmed)
    return trimmed
  } catch {
    return null
  }
}
