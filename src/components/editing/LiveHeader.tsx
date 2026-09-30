import { Suspense, lazy } from 'react'
import { referencesIn, standaloneReference, toRenderTree, type ContentFormat, type Imeta } from '@estiva-app/protocol'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { RichText } from '@/components/ui/RichText'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'

/*
  The editors are their own chunk, as `DescriptionEditing` was: ProseMirror and
  the schema are about 128 kB gzipped against an app that was 125 kB in all, and
  a reader must never download them. A writer gets them in the background; until
  they land the page shows the reading surface, which is the same pixels.
*/
const HeaderEditing = lazy(() => import('./HeaderEditing'))

export interface LiveHeaderProps {
  title: string
  titlePlaceholder: string
  onRename: (value: string) => Promise<boolean> | boolean
  description: string
  format: ContentFormat
  /** The body, and the format tag the editor built it in — RIC-14. */
  onDescribe: (value: string, contentFormat?: string) => Promise<boolean> | boolean
  nameOf?: (pubkey: string) => string
  /** Title and description as text only, for a reader who cannot write. */
  readOnly?: boolean
  /** The upload behind `/` File. Injected so a story needs no relay. */
  upload?: (file: File) => Promise<Imeta>
}

/**
 * The top of a project or an issue page: the title and the description, always
 * editable, with no box (Katerina, 29 September) — Notion's way: you read and
 * write in the same place. Enter in the title moves you into the description;
 * each saves when you leave it.
 *
 * What production's header did, kept: the objects a description points at on a
 * line of their own are drawn below it (RIC-10, with a skeleton while they
 * resolve), a pointer inside a sentence is drawn where it was written, a
 * project's "Archived" chip sits beside its title, and a reader who cannot
 * write gets text and no editor.
 */
export function LiveHeader(props: LiveHeaderProps) {
  const { description, format, nameOf, readOnly = false } = props
  const blocks = toRenderTree(description, format)
  const references = referencesIn(blocks)
  const attached = blocks.map(standaloneReference).filter((r): r is string => !!r)
  const objects = useForeignObjects(references)
  const resolved = byReference(references, objects)
  const cards = attached.map((r) => resolved[r]).filter((o): o is ForeignObjectData => !!o)

  const reading = <ReadingHeader {...props} resolved={resolved} />
  return (
    <div className="flex flex-col gap-4">
      {readOnly ? (
        reading
      ) : (
        <Suspense fallback={reading}>
          <HeaderEditing {...props} resolved={resolved} />
        </Suspense>
      )}
      {attached.length > 0 && objects === undefined && <SkeletonBar className="h-16 w-full" data-foreign-references="loading" />}
      {cards.length > 0 && (
        <div className="flex flex-col gap-2" data-foreign-references={String(cards.length)}>
          {cards.map((object) => (
            <ForeignObject key={object.ref} object={object} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The same page as text: for a reader who cannot write, and for a writer in
 * the moment before the editor arrives. Laid out exactly as the editors are,
 * so nothing moves when they replace it.
 */
function ReadingHeader({ title, titlePlaceholder, description, format, nameOf, readOnly, resolved }: LiveHeaderProps & { resolved: Record<string, ForeignObjectData | null | undefined> }) {
  const empty = description.trim() === ''
  return (
    <div className="flex flex-col gap-4">
      {/* No "Archived" chip beside the title: the Archived notice above it says so in words (Katerina, 30 September). */}
      <h1 className={title ? '-mx-2 px-2 py-1 text-h2 text-text-primary' : '-mx-2 px-2 py-1 text-h2 text-text-muted'}>{title || titlePlaceholder}</h1>
      <div className="-mx-2 px-2 py-1">
        {empty ? <span className="text-body-2 text-text-muted">{readOnly ? '' : 'Add a description…'}</span> : <RichText value={description} format={format} nameOf={nameOf} resolved={resolved} hideStandalone />}
      </div>
    </div>
  )
}
