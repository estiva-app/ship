import { Suspense, lazy, useState } from 'react'
import type { ContentFormat } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { cn } from '@/lib/cn'
import { RichText } from './RichText'

/**
 * A description, written where it is read — RIC-14.
 *
 * > **Miky, 2026-09-04** — *"When you editing the project description, the rich
 * > text field got smaller. It should feel like Notion. You read and edit and
 * > it's 1:1. No big difference between editing and just reading."*
 *
 * What it replaces is `EditableText` with `multiline`, which drew the whole
 * rendered document while reading and then swapped in `<textarea rows={4}>` —
 * so the longest bodies in the workspace collapsed into four rows of raw
 * marker text at the moment somebody started writing, and every heading, list
 * and live reference RIC-5 through RIC-10 built disappeared exactly then.
 *
 * `EditableText` is untouched and still right for a title: one line of prose,
 * where a field that looks like a field is the honest affordance.
 *
 * ## Why there are still two surfaces under here
 *
 * Reading is `RichText` and writing is ProseMirror, and they are kept 1:1 by
 * **sharing the styles rather than by care** — `PROSE_BLOCKS`, applied to both
 * wrappers, addressing elements that both surfaces emit. RIC-9 is what happens
 * when two surfaces are meant to match and nothing makes them: every suite
 * green while one of them quietly lacked a feature.
 *
 * Reading stays `RichText` for three reasons, none of them inertia. It is
 * §13.5's safe renderer and the reason Ship may draw another app's body at
 * all; it carries the per-block comment affordance (§13.6, RIC-7), which
 * belongs to reading — you comment on what somebody else wrote; and it means
 * **a reader never downloads an editor**, which matters more here than it
 * looks: ProseMirror and the schema are 128 kB gzipped against an app that was
 * 125 kB in total.
 *
 * ## Commit
 *
 * Blur commits, Escape reverts. **Enter does not commit** — it makes a
 * paragraph, because that is what Enter does in a document, and it is the one
 * `EditableText` habit that could not survive the thing this ticket asked for.
 */

/*
  Loaded on the first click, never on a read. The fallback is the reading
  surface itself — the same pixels — so the fetch shows as nothing rather than
  as a spinner where the text was.
*/
const DescriptionEditing = lazy(() => import('./DescriptionEditing'))

export function DescriptionEditor({
  value,
  format,
  onCommit,
  placeholder,
  readOnly = false,
  nameOf,
  resolved = {},
  className,
}: {
  value: string
  format: ContentFormat
  /** Resolve `true` when saved; `false` keeps the editor open with the text. */
  onCommit: (value: string, contentFormat?: string) => Promise<boolean> | boolean
  placeholder: string
  readOnly?: boolean
  nameOf?: (pubkey: string) => string
  resolved?: Record<string, ForeignObject | null | undefined>
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const empty = value.trim() === ''

  const reading = (
    // @estiva-escape(no-raw-element, no-rebuilt-behaviour): a click-to-edit surface holding headings and lists, which a button cannot hold; Tab reaches it and Enter opens it since the Edit button went (D37, UIG-8)
    <div
      /* Named for the browser test. `smoke.ts` used to find this surface by the
         screen-reader-only "Edit description" button, and D37 deleted that
         button — leaving the test looking for something no longer rendered.
         There is no accessible name to select instead (the surface is a
         focusable div), so this is one of the `data-` exceptions smoke.ts
         already documents: which surface is on screen is not a role. */
      data-description="reading"
      // The editor's own padding, so entering it moves nothing sideways. The
      // hover edge and the focus ring are EditableText's (an outline, so no
      // pixel moves), so a description reads as the same kind of thing
      // (Katerina, 2026-09-08): Tab reaches it, Enter opens it. The separate
      // "Edit" button that used to be the keyboard's way in is gone (D37).
      className={cn(
        '-mx-2 rounded-md px-2 py-1 transition-colors',
        !readOnly &&
          'cursor-text hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-border-default focus-visible:outline-none focus-visible:shadow-focus-ring',
      )}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => setEditing(true)}
      onKeyDown={
        readOnly
          ? undefined
          : (event) => {
              if (event.key === 'Enter' && event.target === event.currentTarget) {
                event.preventDefault()
                setEditing(true)
              }
            }
      }
    >
      {empty ? (
        <span className="text-body-2 text-text-muted">{readOnly ? '' : placeholder}</span>
      ) : (
        <RichText
          value={value}
          format={format}
          nameOf={nameOf}
          resolved={resolved}
          hideStandalone
        />
      )}
    </div>
  )

  return (
    <div className={cn('relative flex flex-col gap-2', className)}>

      {readOnly || !editing ? (
        reading
      ) : (
        <Suspense fallback={reading}>
          <DescriptionEditing
            value={value}
            format={format}
            onCommit={onCommit}
            onLeave={() => setEditing(false)}
            nameOf={nameOf}
            resolved={resolved}
          />
        </Suspense>
      )}
    </div>
  )
}
