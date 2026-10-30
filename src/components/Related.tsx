import { EmptyState } from '@estiva-app/ui'
import type { ForeignObject } from '@/api/foreign'
import type { RelatedState } from '@/api/useRelated'
import { ForeignObject as FileRow } from '@/components/ui/ForeignObject'

/**
 * The files placed under this project or issue — RFC 0.5 §10.7, *nesting is
 * by intent* — each as the kit's row (Katerina, 30 Oct, widget review 52; rows
 * since 29 September), the widget a message draws, so a file looks the same
 * everywhere Ship shows it:
 *
 * - its kind's tile, its key and title, what it is and where it lives under
 *   them, its state, its comment count opening the conversation, and its faces;
 * - a message as its writer's face, name and words;
 * - a file this reader may not see as the kit's "‹Noun› not available" row,
 *   with the way to open it in its own app, never an empty row;
 * - an object's own list (`children`) and what is placed under a file
 *   (`inside`), nested under it with a line down the left, at any depth;
 * - a read that failed, in words; nothing placed, nothing drawn.
 *
 * Ship never learns what any app is: every row is whatever the other app's
 * projection says (RFC 0.4 §13.1).
 */

/** One file's row: always the row, in a list of files under another. */
function Row({ object, count }: { object: ForeignObject; count?: number }) {
  return <FileRow object={object} conversations={count} row />
}

/** A file, then what is under it — its own list, and what was placed under it — one line down their left. */
function Item({ object, related }: { object: ForeignObject; related: Exclude<RelatedState, 'failed' | undefined> }) {
  const placed = related.inside[object.ref] ?? []
  const own = object.children ?? []
  return (
    <div className="flex flex-col gap-1" data-related-file={object.ref}>
      <Row object={object} count={related.counts[object.ref]} />
      {object.children?.length === 0 && (
        <div className="ml-6 py-1">
          <EmptyState scope="section" message="Nothing in it yet." />
        </div>
      )}
      {(own.length > 0 || placed.length > 0) && (
        <div className="ml-4 flex flex-col gap-1 border-l border-border-default pl-2" data-inside={object.ref}>
          {own.map((child) => (
            <Row key={child.ref} object={child} />
          ))}
          {placed.map((child) => (
            <Item key={child.ref} object={child} related={related} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Related({ related }: { related: RelatedState }) {
  if (related === 'failed') {
    return (
      <p className="text-body-2 text-text-muted" data-related="failed">
        Files placed under this could not be read.
      </p>
    )
  }
  if (!related || related.files.length === 0) return null
  return (
    <div className="flex flex-col gap-1" data-related="files">
      {related.files.map((file) => (
        <Item key={file.ref} object={file} related={related} />
      ))}
    </div>
  )
}

/**
 * Whether a page should draw the Related heading at all.
 *
 * Nearly every project has nothing placed under it today, and a heading over
 * nothing on every page is noise rather than honesty — the honest cases are
 * the ones with something to say: files, or a read that failed. An empty,
 * successful read is the one state that stays silent.
 */
export function hasRelated(related: RelatedState): boolean {
  return related === 'failed' || (related !== undefined && related.files.length > 0)
}
