import type { ReactNode } from 'react'
import type { ForeignObject } from '@/api/foreign'
import { Attachment } from './Attachment'
import { Reference } from './Reference'
import { imetaFromAttrs } from '../../../../src/attachments'
import { standaloneReference, toRenderTree, type RenderBlock, type ContentFormat, type RenderInline } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'
import { PROSE_BLOCKS } from './prose'

/**
 * A body, drawn — SPEC §13.
 *
 * **Ship's position has not moved.** The rule this app has always kept is
 * *"no template strings holding user data — a title goes through `textContent`,
 * never `innerHTML`, because on a shared relay the titles are written by other
 * people."* Nothing here relaxes that. Every string below reaches the DOM as a
 * React child, which React escapes; there is no `dangerouslySetInnerHTML` and
 * there is nothing to interpolate, because `toRenderTree` hands over a resolved
 * tree rather than text to parse.
 *
 * That is what §13.5 means by safe by construction: the app does not decide to
 * be safe, it is handed something it cannot be unsafe with.
 *
 * **The format comes from the event's tag, never from the body** (§13.4). The
 * caller reads it off the fold; a description that happens to begin with `{` is
 * marker text, because it carries no tag. Guessing here would silently
 * reclassify 731 published bodies.
 *
 * Layout is Ship's own, deliberately. RFC 0.4 §13.1's rule — the owner defines
 * the projection, the consumer decides how it looks — is why the package emits
 * a tree and not a component: Peek draws the same tree its own way.
 */
export function RichText({
  value,
  format,
  className,
  nameOf,
  resolved,
  hideStandalone,
}: {
  value: string
  format: ContentFormat
  className?: string
  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  /**
   * The body's references, already resolved — RIC-10.
   *
   * Keyed by URI and resolved once for the whole body, so an object named twice
   * cannot be drawn in two states on one screen.
   */
  resolved?: Record<string, ForeignObject | null | undefined>
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
    // The type styles are `PROSE_BLOCKS`, shared with the editor rather than
    // written twice — see that file for why (RIC-14).
    <div className={cn(PROSE_BLOCKS, className)}>
      {/* The per-block "comment on this" control that used to sit here is
          gone (Katerina, 2026-09-08, D37): a hover-only pencil nobody found.
          Reading a comment that carries an anchor still works — that is
          BlockAnchorNote's job. */}
      {blocks.map((block, i) => renderBlock(block, i, nameOf, resolved))}
    </div>
  )
}

/** A `\n` inside an inline run is a line break, in both content models. */
function renderInline(
  inline: readonly RenderInline[] | undefined,
  keyPrefix: string,
  nameOf?: (pubkey: string) => string,
  resolved?: Record<string, ForeignObject | null | undefined>,
): ReactNode {
  if (!inline) return null
  return inline.map((run, i) => {
    if (run.reference) {
      /*
        A `nostr:` reference — SPEC §13.1. The parser has already decided this
        run is one, so it is drawn rather than pattern-matched back out of the
        text. That is the difference from the display-name form: nothing here
        has to recognise a name, which is why it works for a body Ship did not
        write.
      */
      return (
        <Reference
          key={`${keyPrefix}-${i}`}
          uri={run.reference}
          object={resolved?.[run.reference]}
          nameOf={nameOf}
        />
      )
    }
    if (run.marks.includes('code')) {
      // `code` never combines with another mark (SPEC §13.1), so this branch
      // needs none of the others.
      return <code key={`${keyPrefix}-${i}`}>{run.text}</code>
    }
    const lines = run.text.split('\n')
    /*
      `strong`/`em`/`u` rather than one span wearing classes — RIC-14.

      The editor's marks are ProseMirror's, and ProseMirror emits these three
      elements; drawing the same run as a classed `<span>` here would be two
      spellings of one thing, styled in two places, free to drift. `PROSE_BLOCKS`
      styles the elements, so both surfaces get whatever it says.

      Still not `<b>`/`<i>`: the mark is meaning, and `RichText.test.tsx`
      asserts a literal `<b>` typed by an author never reaches the DOM as one.
    */
    let node: ReactNode = lines.map((line, j) => (
      <span key={j}>
        {j > 0 && <br />}
        {line}
      </span>
    ))
    if (run.marks.includes('underline')) node = <u>{node}</u>
    if (run.marks.includes('italic')) node = <em>{node}</em>
    if (run.marks.includes('bold')) node = <strong>{node}</strong>
    return <span key={`${keyPrefix}-${i}`}>{node}</span>
  })
}

function renderBlock(
  block: RenderBlock,
  i: number,
  nameOf?: (pubkey: string) => string,
  resolved?: Record<string, ForeignObject | null | undefined>,
): ReactNode {
  const key = block.id ?? `b${i}`
  const inline = renderInline(block.inline, key, nameOf, resolved)

  switch (block.type) {
    /*
      Every case below draws the element ProseMirror draws, unstyled — RIC-14.
      The look is `PROSE_BLOCKS` on the wrapper, which the editor wears too, so
      neither surface can be restyled without the other.
    */
    case 'heading': {
      const H = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      return <H key={key} data-block-id={block.id}>{inline}</H>
    }
    case 'paragraph':
      return <p key={key} data-block-id={block.id}>{inline}</p>
    case 'bulletList':
      return (
        <ul key={key} data-block-id={block.id}>
          {block.children?.map((child, j) => <li key={child.id ?? j} data-block-id={child.id}>{renderInline(child.inline, `${key}-${j}`, nameOf, resolved)}</li>)}
        </ul>
      )
    case 'orderedList':
      return (
        <ol key={key} data-block-id={block.id}>
          {block.children?.map((child, j) => <li key={child.id ?? j} data-block-id={child.id}>{renderInline(child.inline, `${key}-${j}`, nameOf, resolved)}</li>)}
        </ol>
      )
    case 'blockquote':
      return (
        <blockquote key={key} data-block-id={block.id}>
          {inline}
        </blockquote>
      )
    case 'codeBlock':
      // A fence is literal by definition, and scrolls on its own so one long
      // line cannot widen the column.
      return (
        <pre key={key} data-block-id={block.id} data-language={block.language}>
          <code>{(block.inline ?? []).map((r) => r.text).join('')}</code>
        </pre>
      )
    case 'horizontalRule':
      return <hr key={key} data-block-id={block.id} />
    case 'listItem':
      return <div key={key} data-block-id={block.id}>{inline}</div>
    case 'attachment': {
      /*
        SPEC §13.3, SHI-2. `attrs` are the `imeta` fields, so this is the same
        component a message's attachment uses — including the authenticated
        fetch, because media GET answers 401 to an `<img src>`.

        A block missing a REQUIRED field falls through to the default: §13.3
        calls it malformed and asks for the inline text rather than a broken
        file, which is the same thing a reader does with a type it has never
        heard of.
      */
      const file = imetaFromAttrs(block.attrs)
      if (file) {
        return (
          <div key={key} data-block-id={block.id}>
            <Attachment file={file} />
          </div>
        )
      }
      return fallbackBlock(block, key, nameOf, resolved, inline)
    }
    default:
      return fallbackBlock(block, key, nameOf, resolved, inline)
  }
}

/**
 * `table`, `widget`, a malformed `attachment`, and anything a later version
 * publishes.
 *
 * §13.3: a reader MUST render an unknown block's inline text and MUST NOT drop
 * it silently — a block that vanishes is indistinguishable from one the reader
 * is not allowed to see. Drawing it as a paragraph is the honest fallback until
 * Ship has a design for it.
 */
function fallbackBlock(
  block: RenderBlock,
  key: string,
  nameOf: ((pubkey: string) => string) | undefined,
  resolved: Record<string, ForeignObject | null | undefined> | undefined,
  inline: ReactNode,
): ReactNode {
  return (
    <div key={key} data-block-id={block.id} data-block-type={block.typeName ?? block.type}>
      {inline}
      {block.children?.map((child, j) => renderBlock(child, j, nameOf, resolved))}
    </div>
  )
}
