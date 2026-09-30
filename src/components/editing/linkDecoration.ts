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
/** `[words](url)` names its address in the brackets; a bare address is its own. */
const LINK_TARGET = /\]\(([^\s)]+)\)$/

/**
 * `openOnClick`: a click on a link opens it in a new tab, as a link in a read
 * page does (Katerina, 30 September: the always-editable description had made
 * its links unclickable). On for the description; off in the message box,
 * where a click is part of writing.
 */
export const LinkDecoration = Extension.create<{ openOnClick: boolean }>({
  name: 'linkDecoration',
  addOptions() {
    return { openOnClick: false }
  },
  addProseMirrorPlugins() {
    const openOnClick = this.options.openOnClick
    return [
      new Plugin({
        key: new PluginKey('linkDecoration'),
        props: {
          handleClick: (_view, _pos, event) => {
            if (!openOnClick || event.button !== 0) return false
            const link = (event.target as HTMLElement | null)?.closest?.('[data-href]')
            const href = link?.getAttribute('data-href')
            if (!href) return false
            window.open(href, '_blank', 'noopener,noreferrer')
            return true
          },
          decorations: ({ doc }) => {
            const found: Decoration[] = []
            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              // A code run is literal, so an address quoted as an example is not a link.
              if (node.marks.some((mark) => mark.type.name === 'code')) return
              for (const match of node.text.matchAll(LINK_SPLIT)) {
                if (match.index === undefined) continue
                const text = match[0].startsWith('[') ? match[0] : match[0].replace(TRAILING, '')
                const href = text.startsWith('[') ? (LINK_TARGET.exec(text)?.[1] ?? '') : text
                found.push(
                  Decoration.inline(pos + match.index, pos + match.index + text.length, {
                    class: openOnClick ? `${LINK_CLASS} cursor-pointer` : LINK_CLASS,
                    ...(openOnClick && href ? { 'data-href': href } : {}),
                  }),
                )
              }
            })
            return found.length ? DecorationSet.create(doc, found) : null
          },
        },
      }),
    ]
  },
})
