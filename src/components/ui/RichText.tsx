import type { ForeignObject } from '@/api/foreign'
import { RichText as PackageRichText, type RichTextBlock, type RichTextSize } from '@estiva-app/ui'
import { Attachment } from './Attachment'
import { Reference } from './Reference'
import { imetaFromAttrs } from '../../nostr/attachments'
import { standaloneReference, toRenderTree, type ContentFormat } from '@estiva-app/protocol'

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
 * file (`Attachment`) — and which standalone pointers leave the text.
 */
export function RichText({
  value,
  format,
  size,
  nameOf,
  resolved,
  urgent,
  hideStandalone,
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
   * Skip a block that is nothing but one reference.
   *
   * Those are attachments and are drawn below the text by the caller. Passing
   * this rather than deciding here keeps the rule in one place — the caller
   * already has to know which references are standalone in order to draw them.
   *
   * **A predicate, for a caller that cannot afford to hide one it will not
   * draw** (SHI-1). A pointer nothing resolves is an attachment the caller has
   * no card for, so hiding it unconditionally deletes it from the screen — fine
   * inside a description, and not fine when the pointer is the whole message,
   * which then renders as a name and a time above nothing. §13.1's rule is that
   * a reference is never blank: a caller passing a predicate keeps the shortened
   * chip for whatever it cannot draw below.
   */
  hideStandalone?: boolean | ((reference: string) => boolean)
}) {
  const all = toRenderTree(value, format)
  // A block that is nothing but one reference is an attachment; the caller
  // draws it below the text (SPEC §13.1, RIC-10).
  const hide =
    typeof hideStandalone === 'function' ? hideStandalone : hideStandalone ? () => true : () => false
  const blocks = all.filter((b) => {
    const reference = standaloneReference(b)
    return !reference || !hide(reference)
  })
  if (blocks.length === 0) return null
  return (
    <PackageRichText
      blocks={blocks}
      size={size}
      renderReference={(reference) => <Reference uri={reference} object={resolved?.[reference]} nameOf={nameOf} urgent={urgent} />}
      renderBlock={drawAttachment}
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
function drawAttachment(block: RichTextBlock) {
  if (block.type !== 'attachment') return undefined
  const file = imetaFromAttrs(block.attrs)
  if (!file) return undefined
  return (
    <div key={block.id} data-block-id={block.id}>
      <Attachment file={file} />
    </div>
  )
}
