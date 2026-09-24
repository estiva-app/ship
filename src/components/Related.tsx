import type { ForeignObject as ForeignObjectType } from '@estiva-app/interop'
import type { RelatedFiles } from '@/api/foreign'
import type { RelatedState } from '@/api/useRelated'
import { ForeignObject } from '@/components/ui/ForeignObject'

/**
 * The foreign files somebody placed under this project or issue — RFC 0.5
 * §10.7, *nesting is by intent*.
 *
 * Every row is a `<ForeignObject>`, the same component that draws a reference
 * pasted into a comment and a file in the folder view, and nothing here knows
 * what any of them are: a bare-file topic is a card with its title and its
 * comment count, a Leaf document will be whatever Leaf's manifest says, and a
 * kind nobody has heard of falls through the widget chain like everything
 * else. In the Folder's order, and what is under each file indented beneath it
 * at whatever depth the listing holds (FOL-4) — each card still opens in its
 * own app, where the nesting continues.
 *
 * ## What the section says, and when it is there at all
 *
 * Three answers reach this component and two of them draw nothing: `undefined`
 * (the read is in flight) and an empty list (nothing is placed here). The
 * third, `'failed'`, draws a line — because a read that did not come back must
 * never look like "nothing is placed under this", which is peek#189's invariant
 * and the reason the hook keeps the two apart. The page decides whether the
 * heading is drawn (`hasRelated`); this component draws what goes under it.
 *
 * A file the reader may not see never arrives: the folder read drops it, by
 * design, and the count is the disclosure (interop, `resolveFolderContents`).
 * So there is no "unavailable" row here and there should not be one.
 */
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
    <div className="flex flex-col gap-2" data-related="files">
      {related.files.map((file) => (
        <RelatedFile key={file.ref} file={file} related={related} />
      ))}
    </div>
  )
}

/**
 * One related file, and what is under it, indented (FOL-4).
 *
 * Ship renders the nesting and does not own it: every card opens in the app
 * that does (its `openUrl`), where the breadcrumb and the tree continue. The
 * depth is whatever the listing holds — `readRelated` walked it once, and a
 * cycle is cut there, so this recursion ends.
 */
function RelatedFile({ file, related }: { file: ForeignObjectType; related: RelatedFiles }) {
  const inside = related.inside[file.ref] ?? []
  return (
    <div className="flex flex-col gap-2" data-related-file={file.ref}>
      <ForeignObject object={file} conversations={related.counts[file.ref]} />
      {inside.length > 0 && (
        <div className="flex flex-col gap-2 pl-6" data-inside={file.ref}>
          {inside.map((child) => (
            <RelatedFile key={child.ref} file={child} related={related} />
          ))}
        </div>
      )}
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
