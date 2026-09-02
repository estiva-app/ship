import type { ReactNode } from 'react'
import { toRenderTree, type RenderBlock, type ContentFormat, type RenderInline } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'

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
export function RichText({ value, format, className }: { value: string; format: ContentFormat; className?: string }) {
  const blocks = toRenderTree(value, format)
  if (blocks.length === 0) return null
  return <div className={cn('flex flex-col gap-2', className)}>{blocks.map(renderBlock)}</div>
}

/** A `\n` inside an inline run is a line break, in both content models. */
function renderInline(inline: readonly RenderInline[] | undefined, keyPrefix: string): ReactNode {
  if (!inline) return null
  return inline.map((run, i) => {
    if (run.marks.includes('code')) {
      // `code` never combines with another mark (SPEC §13.1), so this branch
      // needs none of the others.
      return (
        <code key={`${keyPrefix}-${i}`} className="rounded-sm bg-bg-inset px-1 py-0.5 font-mono text-[0.9em]">
          {run.text}
        </code>
      )
    }
    const lines = run.text.split('\n')
    return (
      <span
        key={`${keyPrefix}-${i}`}
        className={cn(
          run.marks.includes('bold') && 'font-semibold',
          run.marks.includes('italic') && 'italic',
          run.marks.includes('underline') && 'underline underline-offset-2',
        )}
      >
        {lines.map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {line}
          </span>
        ))}
      </span>
    )
  })
}

function renderBlock(block: RenderBlock, i: number): ReactNode {
  const key = block.id ?? `b${i}`
  const inline = renderInline(block.inline, key)

  switch (block.type) {
    case 'heading': {
      const cls = block.level === 1 ? 'text-h3' : block.level === 2 ? 'text-h4' : 'text-body-1 font-semibold'
      return <div key={key} data-block-id={block.id} className={cn(cls, 'text-text-primary')}>{inline}</div>
    }
    case 'bulletList':
      return (
        <ul key={key} data-block-id={block.id} className="list-disc pl-5">
          {block.children?.map((child, j) => <li key={child.id ?? j} data-block-id={child.id}>{renderInline(child.inline, `${key}-${j}`)}</li>)}
        </ul>
      )
    case 'orderedList':
      return (
        <ol key={key} data-block-id={block.id} className="list-decimal pl-5">
          {block.children?.map((child, j) => <li key={child.id ?? j} data-block-id={child.id}>{renderInline(child.inline, `${key}-${j}`)}</li>)}
        </ol>
      )
    case 'blockquote':
      return (
        <blockquote key={key} data-block-id={block.id} className="border-l-2 border-border-default pl-3 text-text-secondary">
          {inline}
        </blockquote>
      )
    case 'codeBlock':
      // A fence is literal by definition, and scrolls on its own so one long
      // line cannot widen the column.
      return (
        <pre key={key} data-block-id={block.id} data-language={block.language} className="overflow-x-auto rounded-md bg-bg-inset p-2 font-mono text-[0.9em] text-text-primary">
          <code>{(block.inline ?? []).map((r) => r.text).join('')}</code>
        </pre>
      )
    case 'horizontalRule':
      return <hr key={key} data-block-id={block.id} className="border-border-default" />
    case 'listItem':
      return <div key={key} data-block-id={block.id}>{inline}</div>
    default:
      /*
        `table`, `attachment`, `widget` and anything a later version publishes.
        §13.3: a reader MUST render an unknown block's inline text and MUST NOT
        drop it silently — a block that vanishes is indistinguishable from one
        the reader is not allowed to see. Drawing it as a paragraph is the
        honest fallback until Ship has a design for it.
      */
      return (
        <div key={key} data-block-id={block.id} data-block-type={block.typeName ?? block.type}>
          {inline}
          {block.children?.map(renderBlock)}
        </div>
      )
  }
}
