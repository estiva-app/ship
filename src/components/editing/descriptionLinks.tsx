import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { imetaFromAttrs, linksAsReferences, referenceOfLink, toRenderTree, urlRunsIn, type ContentFormat, type LinkResolver, type RenderBlock } from '@estiva-app/protocol'
import { RichText } from '@estiva-app/ui'
import type { AttachmentViewProps, ReferenceViewProps } from '@estiva-app/ui/editor'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { Attachment } from '@/components/ui/Attachment'
import { MessageCard, MessageChip, MessageRow } from '@/components/ui/MessageLinks'
import { Reference } from '@/components/ui/Reference'
import { drawAttachment } from '@/components/ui/ShipRichText'
import { placeDocumentLines, ROW_BLOCK, type RowLine } from '@/lib/messageLines'

type Resolved = Record<string, ForeignObjectData | null | undefined>

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

interface DescriptionLinksValue {
  resolved: Resolved
  nameOf?: (pubkey: string) => string
  /** Only read: its files open, and a card's values are words, since this reader cannot act here. */
  readOnly: boolean
}

const Links = createContext<DescriptionLinksValue>({ resolved: {}, readOnly: false })

/**
 * Every link the description's editor holds, read once and handed to each one,
 * with the people's names. A link put in since the description was saved — a
 * URL that became its chip while typing, a `[` pick — is read here, not left
 * loading until the save.
 */
export function DescriptionLinks({ editor, resolved, nameOf, readOnly, children }: { editor: Editor | null; resolved: Resolved; nameOf?: (pubkey: string) => string; readOnly: boolean; children: ReactNode }) {
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
  const all = missing.length ? { ...own, ...resolved } : resolved
  return <Links.Provider value={{ resolved: all, nameOf, readOnly }}>{children}</Links.Provider>
}

/**
 * A link in a description, drawn by where it sits (`place`, §13.3) with the
 * same chip, row and card a message draws: the chip in a sentence, the row
 * alone on its line, the card in the row's place when its writer chose Card.
 * While editing, a click is the chip menu's, so the chip shows no hover card.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/every-app-edits-a-document-with-one-shared-editor.md
 */
export function DescriptionLink({ uri, href, place = 'chip', editing = false }: ReferenceViewProps) {
  const { resolved, nameOf } = useContext(Links)
  if (/^nostr:npub1/i.test(uri)) return <Reference uri={uri} nameOf={nameOf} />
  const object = resolved[uri]
  if (place === 'card') return <DescriptionCard uri={uri} object={object} href={href} />
  if (place === 'row') return <MessageRow uri={uri} object={object} opensAt={href} />
  // A URL whose file has not come back, or cannot be read, reads as the URL it was written as (WBM-11).
  if (href && (!object || object.unreachable)) return <span>{href}</span>
  return <MessageChip uri={uri} object={object} nameOf={nameOf} preview={!editing} opensAt={href} />
}

/**
 * The description as text, in the moment before its editor arrives: each link drawn where and as the editor will
 * draw it (`placeDocumentLines`, as `LinkPlaces` places them), its chip, its row, or its card in the row's place, so
 * nothing moves when the editor replaces it (Katerina, 30 Oct). `resolveLink` is what each app URL names.
 */
export function DescriptionReading({ value, format, resolveLink, resolved, nameOf, readOnly }: { value: string; format: ContentFormat; resolveLink: LinkResolver; resolved: Resolved; nameOf?: (pubkey: string) => string; readOnly: boolean }) {
  const placed = placeDocumentLines(linksAsReferences(toRenderTree(value, format), resolveLink), { resolveLink })
  if (placed.blocks.length === 0) return null
  const line = (row: RowLine) => <DescriptionLink uri={row.reference} {...(row.url ? { href: row.url } : {})} place={row.card ? 'card' : 'row'} editing={!readOnly} />
  return (
    <Links.Provider value={{ resolved, nameOf, readOnly }}>
      <RichText
        blocks={placed.blocks}
        renderReference={(reference, run) => {
          const row = placed.rowRuns.get(run)
          if (row) return line(row)
          // Only a run whose words are a URL naming this same file is where it opens: a stored reference's words are its writer's (security review).
          const href = /^https?:\/\//i.test(run.text) && referenceOfLink(run.text, resolveLink) === reference ? run.text : undefined
          return <DescriptionLink uri={reference} {...(href ? { href } : {})} editing={!readOnly} />
        }}
        renderBlock={(block) => {
          const row = block.type === ROW_BLOCK ? placed.rowOf(block) : undefined
          return row ? <div data-block-id={block.id}>{line(row)}</div> : drawAttachment(block)
        }}
      />
    </Links.Provider>
  )
}

/**
 * The card its writer chose, its pickers live while the caret is in the text too (Katerina, 30 Oct, against the
 * record a-card-changes-what-a-files-app-shares's "words while the text is edited"). Words only where the reader
 * cannot act: a description only read.
 */
function DescriptionCard({ uri, object, href }: { uri: string; object: ForeignObjectData | null | undefined; href?: string }) {
  const { readOnly } = useContext(Links)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = card.current
    if (!element) return
    // ProseMirror sees a press before React does and takes the caret into the text, closing the picker before it
    // opened. It leaves alone a press whose default is prevented (as Leaf's). Goes once the kit's BlockNodes does it.
    const keep = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button, [role="combobox"]')) event.preventDefault()
    }
    element.addEventListener('mousedown', keep)
    return () => element.removeEventListener('mousedown', keep)
  }, [])
  return (
    <div ref={card}>
      <MessageCard uri={uri} object={object} opensAt={href} words={readOnly} />
    </div>
  )
}

/**
 * A file in the description, as a message's attachment draws it. It opens and
 * downloads only for a reader: a writer's text saves and closes when it loses
 * focus, and the card's link and Download button take it (measured 2026-09-15).
 */
export function DescriptionFile({ attrs }: AttachmentViewProps) {
  const { readOnly } = useContext(Links)
  // The attributes are whoever saved last's: a block the protocol will not name as a file is not drawn as one (§13.3).
  const file = imetaFromAttrs(attrs)
  if (!file) return <span>{typeof attrs.filename === 'string' ? attrs.filename : 'attachment'}</span>
  return <Attachment file={file} opens={readOnly} />
}
