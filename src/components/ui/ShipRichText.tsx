import type { ForeignObject } from '@/api/foreign'
import { RichText as PackageRichText, type RichTextBlock, type RichTextSize } from '@estiva-app/ui'
import { Attachment } from './Attachment'
import { Reference } from './Reference'
import { imetaFromAttrs } from '../../nostr/attachments'
import type { ReactNode } from 'react'
import { linksAsReferences, referenceOfLink, toRenderTree, type ContentFormat, type LinkResolver, type RenderBlock } from '@estiva-app/protocol'

/**
 * A body, drawn — SPEC §13.
 *
 * **Ship's position has not moved.** The rule this app has always kept is
 * *"no template strings holding user data — a title goes through `textContent`,
 * never `innerHTML`, because on a shared relay the titles are written by other
 * people."* Nothing here relaxes that: `toRenderTree` hands over a resolved tree
 * rather than text to parse, and the package's `RichText` sets every string as
 * a React child.
 *
 * **The format comes from the event's tag, never from the body** (§13.4). The
 * caller reads it off the fold; a description that happens to begin with `{` is
 * marker text, because it carries no tag. Guessing here would silently
 * reclassify 731 published bodies.
 *
 * **The look is the package's** (UIG-30, Katerina, 28 September): Peek and Ship
 * had drawn the same tree two ways, and one design now draws both. What is
 * Ship's is what a word points at — a person or an item (`Reference`) and a
 * file (`Attachment`) — and what a description draws after a line, its cards.
 */
export function ShipRichText({
  value,
  format,
  size,
  nameOf,
  resolved,
  urgent,
  renderAfter,
  resolveLink,
}: {
  value: string
  format: ContentFormat
  /** The package's size: `small` for another app's text inside a card. */
  size?: RichTextSize
  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  /**
   * The body's references, already resolved — RIC-10.
   *
   * Keyed by URI and resolved once for the whole body, so an object named twice
   * cannot be drawn in two states on one screen.
   */
  resolved?: Record<string, ForeignObject | null | undefined>
  /** A message's urgent keys, which draw their person chips urgent — SPEC §13.1, CON-24. */
  urgent?: readonly string[]
  /**
   * Draws after a line of the text — where a description's chip asks for its
   * card (SPEC §13.3; `blockLineCards`). Only a page's own description passes
   * it: inside a card's body every reference is its chip, never a card, or two
   * objects that card each other nest forever. A reference alone on its line
   * is its chip too, as in a message (OPT-18).
   */
  renderAfter?: (block: RenderBlock) => ReactNode
  /**
   * What each app link names (§7.7), so a bare link draws as the chip of what
   * it names, as Peek draws it (`linksAsReferences`, OPT-18) — in a message,
   * and in a description, where a URL keeps the card its writer chose (SPEC
   * §13.3, Widgets). A link on words stays a link, and one not answered yet
   * stays the URL.
   */
  resolveLink?: LinkResolver
}) {
  const tree = toRenderTree(value, format)
  const blocks = resolveLink ? linksAsReferences(tree, resolveLink) : tree
  if (blocks.length === 0) return null
  return (
    <PackageRichText
      blocks={blocks}
      size={size}
      // A link to one block opens at the block (WBM-11): the run keeps the URL as written. Only a run whose words are
      // that URL, resolved to this same file: a stored reference's words are its author's (security review).
      renderReference={(reference, run) => (
        <Reference uri={reference} object={resolved?.[reference]} nameOf={nameOf} urgent={urgent} opensAt={resolveLink && referenceOfLink(run.text, resolveLink) === reference ? run.text : undefined} />
      )}
      renderBlock={drawAttachment}
      // The package's block is the protocol's, handed back.
      renderAfter={renderAfter ? (block) => renderAfter(block as RenderBlock) : undefined}
    />
  )
}

/**
 * A file in a description — SPEC §13.3, SHI-2. `attrs` are the `imeta` fields,
 * so this is the same component a message's attachment uses, including the
 * authenticated fetch, because media GET answers 401 to an `<img src>`.
 *
 * A block missing a REQUIRED field is left to the package, which draws its
 * words: §13.3 calls it malformed and asks for the inline text rather than a
 * broken file.
 */
export function drawAttachment(block: RichTextBlock) {
  if (block.type !== 'attachment') return undefined
  const file = imetaFromAttrs(block.attrs)
  if (!file) return undefined
  return (
    <div key={block.id} data-block-id={block.id}>
      <Attachment file={file} />
    </div>
  )
}
