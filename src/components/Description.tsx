import { referencesIn, standaloneReference, toRenderTree, type ContentFormat } from '@estiva-app/protocol'
import { DescriptionEditor } from '@/components/ui/DescriptionEditor'
import { ForeignObject } from '@/components/ui/ForeignObject'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { byReference, useForeignObjects } from '@/api/useForeignObjects'
import { cn } from '@/lib/cn'

/**
 * An object's description, whole — the editor, the rendering, and the objects
 * it refers to.
 *
 * **This exists because the three were assembled by hand at each call site and
 * one copy was assembled wrong.** An issue's description stripped its
 * `nostr:naddr…` pointers out of the prose and drew the objects they name
 * below it (PRO-7); a project's did neither, so the field carrying the longest
 * bodies in the workspace showed a wall of bech32 and nothing that said what it
 * pointed at. Every suite was green, because nothing was broken — one surface
 * simply had a feature the other did not, and no test knows the two are meant
 * to match.
 *
 * So the pairing is one component now. Stripping the pointer and rendering the
 * object are two halves of one decision, and a caller cannot take one without
 * the other: showing the bech32 *and* the object is worse than either, and
 * showing neither is what a project description did.
 *
 * **Editing is `DescriptionEditor` since RIC-14**, and the `display`/
 * `displayNode` split this used to need went with `EditableText`: there is no
 * second string to keep in step, because reading and writing are now the same
 * document rather than a rendering and its source.
 */
export function Description({
  value,
  format,
  onCommit,
  readOnly = false,
  nameOf,
  className,
}: {
  value: string
  format: ContentFormat
  /**
   * The body to publish, and the format tag that says what it is — RIC-14.
   *
   * The tag travels because the editor is what built the document; §13.4's
   * rule is that a body's format is on the event and never guessed from the
   * body, so the one component that knows has to say.
   */
  onCommit: (next: string, contentFormat?: string) => Promise<boolean> | boolean
  readOnly?: boolean
  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  className?: string
}) {
  /*
    RIC-10 — where each reference belongs.

    The body used to have every `nostr:` pointer cut out of it before rendering,
    because a description had no structure to put a widget into. It has one now
    (§13.3), so the two variants Miky asked for are both available: a pointer
    alone on its line is an *attachment* and is drawn below; a pointer inside a
    sentence is a *mention* and is drawn where it was written.

    `standaloneReference` is the package's rule rather than this app's, because
    Peek has to reach the same answer or the same body reads differently in each
    (SPEC §10).
  */
  const blocks = toRenderTree(value, format)
  const references = referencesIn(blocks)
  const attached = blocks.map(standaloneReference).filter((r): r is string => !!r)
  const objects = useForeignObjects(references)
  const resolved = byReference(references, objects)
  const attachments = attached.map((r) => resolved[r]).filter((o): o is NonNullable<typeof o> => !!o)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <DescriptionEditor
        value={value}
        format={format}
        onCommit={onCommit}
        placeholder="Add a description…"
        readOnly={readOnly}
        nameOf={nameOf}
        resolved={resolved}
      />
      {attached.length > 0 && objects === undefined && (
        <SkeletonBar className="h-16 w-full" data-foreign-references="loading" />
      )}
      {attachments.length > 0 && (
        <div className="flex flex-col gap-2" data-foreign-references={String(attachments.length)}>
          {attachments.map((object) => (
            <ForeignObject key={object.ref} object={object} />
          ))}
        </div>
      )}
    </div>
  )
}
