import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * A link looks like a link while you write it — from the unmerged
 * branch `ric/notion-description` (22 September), finding E6.
 *
 * **A decoration, not a mark.** The saved format has no link mark, so a mark
 * would be dropped on save. A decoration is drawn over the text without being
 * in it: the same text saves byte for byte.
 *
 * The two patterns are the package reader's own (`RichText`, `LINK_SPLIT` and
 * `BARE_LINK`), so the editor marks exactly what the reader will link. The
 * class is the package `Link variant="text"` look, spelled out because a
 * decoration is a class on a range, with no element to hand a component.
 */
const LINK_SPLIT = /\[[^[\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)|https?:\/\/[^\s]+/g
/** Punctuation after a bare address ends the sentence, not the address. */
const TRAILING = /[.,;:!?)\]]+$/
const LINK_CLASS = 'text-info-default underline underline-offset-2'

export const LinkDecoration = Extension.create({
  name: 'linkDecoration',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkDecoration'),
        props: {
          decorations: ({ doc }) => {
            const found: Decoration[] = []
            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              // A code run is literal, so an address quoted as an example is not a link.
              if (node.marks.some((mark) => mark.type.name === 'code')) return
              for (const match of node.text.matchAll(LINK_SPLIT)) {
                if (match.index === undefined) continue
                const text = match[0].startsWith('[') ? match[0] : match[0].replace(TRAILING, '')
                found.push(Decoration.inline(pos + match.index, pos + match.index + text.length, { class: LINK_CLASS }))
              }
            })
            return found.length ? DecorationSet.create(doc, found) : null
          },
        },
      }),
    ]
  },
})
