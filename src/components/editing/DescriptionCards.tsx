import { createPortal } from 'react-dom'
import { useEditorState, type Editor } from '@tiptap/react'
import { IconCircleOff, IconLayoutCards, IconLayoutList } from '@tabler/icons-react'
import { blockCards, urlRunsIn, type RenderBlock } from '@estiva-app/protocol'
import { ToolbarButton } from '@estiva-app/ui'
import { referenceAtSelection, setReferenceCard, useReferenceCards, type ReferenceCard, type ReferenceCardLayout } from '@estiva-app/ui/editor'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { SkeletonBar } from '@/components/ui/Skeleton'

type Resolved = Record<string, ForeignObjectData | null | undefined>

/**
 * The cards a description's chips ask for, after the line that holds them
 * (SPEC §13.3, "A reference's card"): compact is the object's row, detailed its
 * card, as under a message (§13.6.2). Each holds its place while it loads, and
 * one that cannot be read draws nothing, as under a message.
 */
export function LineCards({ cards, resolved }: { cards: readonly ReferenceCard[]; resolved: Resolved }) {
  if (cards.length === 0) return null
  return (
    <div className="mt-2 flex flex-col gap-2" data-line-cards={cards.length}>
      {cards.map((card, i) => {
        const object = resolved[card.uri]
        if (object === undefined) return <SkeletonBar key={`${card.uri}-${i}`} className="h-16 w-full" data-foreign-references="loading" />
        if (object === null) return null
        return <ForeignObject key={`${card.uri}-${i}`} object={object} layout={card.layout === 'detailed' ? 'card' : 'row'} />
      })}
    </div>
  )
}

/** A read description's cards for one block, for `ShipRichText`'s `renderAfter`. */
export function blockLineCards(block: RenderBlock, resolved: Resolved) {
  const cards = blockCards(block).map((card) => ({ uri: card.reference, layout: card.layout }))
  return cards.length ? <LineCards cards={cards} resolved={resolved} /> : null
}

/** How many of a description's URLs are asked what they name — the editor's `LinkChips` limit. */
export const MAX_LINKS_PER_DESCRIPTION = 24

/**
 * The URLs a description holds — in its text, and on a link that carries a
 * card — for `useLinkValues` to ask what each names (§7.7, Widgets). At most
 * `MAX_LINKS_PER_DESCRIPTION`, the first ones, as a message's are capped: a
 * claimed link is a relay query for every viewer. The rest stay links.
 */
export function linksInBlocks(blocks: readonly RenderBlock[]): string[] {
  const out = new Set<string>()
  const walk = (bs: readonly RenderBlock[]) => {
    for (const block of bs) {
      if (block.type === 'codeBlock') continue
      for (const run of block.inline ?? []) {
        // A link on words never becomes a chip, so it spends none of the budget.
        if (run.href) {
          if (run.text === run.href) out.add(run.href)
        }
        else if (!run.reference && !run.marks.includes('code')) for (const { url } of urlRunsIn(run.text)) out.add(url)
      }
      if (block.children) walk(block.children)
    }
  }
  walk(blocks)
  return [...out].slice(0, MAX_LINKS_PER_DESCRIPTION)
}

/**
 * What the editor's chips draw from: the page's answers, and for a chip put in
 * since the description was saved — a URL that became its chip while typing —
 * its own, rather than loading until the save.
 */
export function useChipObjects(editor: Editor | null, resolved: Resolved): Resolved {
  const key = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return ''
      const uris = new Set<string>()
      ed.state.doc.descendants((node) => {
        if (node.type.name === 'reference' && node.attrs.uri) uris.add(String(node.attrs.uri))
      })
      return [...uris].join('\n')
    },
  })
  const missing = (key ? key.split('\n') : []).filter((uri) => !(uri in resolved))
  const own = byReference(missing, useForeignObjects(missing))
  return missing.length ? { ...own, ...resolved } : resolved
}

/**
 * The editor's cards, each drawn into the slot after its line. A chip put in
 * since the description was saved is not in the page's answers yet, so its
 * card asks for itself rather than loading until the save.
 */
export function EditorLineCards({ editor, resolved }: { editor: Editor | null; resolved: Resolved }) {
  const slots = useReferenceCards(editor)
  const missing = [...new Set(slots.flatMap((slot) => slot.cards.map((card) => card.uri)))].filter((uri) => !(uri in resolved))
  const own = byReference(missing, useForeignObjects(missing))
  const all = missing.length ? { ...own, ...resolved } : resolved
  // @estiva-escape(no-rebuilt-behaviour): each card goes into the slot ReferenceCards placed after its line, inside the editor's text; no part owns a place there, and a portal keeps Ship's providers around the card
  return <>{slots.map((slot) => createPortal(<LineCards cards={slot.cards} resolved={all} />, slot.element, slot.key))}</>
}

const CHOICES: { layout: ReferenceCardLayout; label: string; Icon: typeof IconCircleOff }[] = [
  { layout: 'none', label: 'No card', Icon: IconCircleOff },
  { layout: 'compact', label: 'Compact card', Icon: IconLayoutList },
  { layout: 'detailed', label: 'Detailed card', Icon: IconLayoutCards },
]

/**
 * None, compact or detailed for the selected chip, in the selection toolbar.
 * Shown only while one chip is selected: a chip here is a link, so it is
 * selected with Shift+arrow or a drag across it. Build first; the look is
 * Katerina's to level up (Miky, 5 Oct).
 */
export function CardChoice({ editor }: { editor: Editor | null }) {
  const at = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed || ed.isDestroyed) return null
      const chip = referenceAtSelection(ed.state)
      return chip ? chip.layout : null
    },
  })
  if (!editor || !at) return null
  return (
    <>
      {CHOICES.map(({ layout, label, Icon }) => (
        <ToolbarButton
          key={layout}
          aria-label={label}
          tooltip={label}
          pressed={at === layout}
          data-card-choice={layout}
          // Keep the selection: focus must not leave the editor on press.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setReferenceCard(editor, layout)}
        >
          <Icon size={16} stroke={1.5} />
        </ToolbarButton>
      ))}
    </>
  )
}
