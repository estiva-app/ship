import { stripNaddrs, type ContentFormat } from '@estiva-app/protocol'
import { EditableText } from '@/components/ui/EditableText'
import { RichText } from '@/components/ui/RichText'
import { ForeignReferences } from '@/components/ForeignReferences'
import { descriptionForEditing } from '@/lib/description'
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
 * The `display`/`displayNode` split is `EditableText`'s: the string decides
 * emptiness so a blank description still shows its placeholder, and the node is
 * what gets drawn. `value` is untouched by both, so what a person edits is the
 * text they wrote, pointers included — they are only hidden from the *reading*.
 */
export function Description({
  value,
  format,
  onCommit,
  readOnly = false,
  onCommentOn,
  nameOf,
  className,
}: {
  value: string
  format: ContentFormat
  onCommit: (next: string) => Promise<boolean> | boolean
  readOnly?: boolean
  /** Offer to comment on one block — SPEC §13.6. Omitted where nobody may write. */
  onCommentOn?: (blockId: string) => void
  /** Resolve a mentioned key to a name — SPEC §13.1. The workspace directory's. */
  nameOf?: (pubkey: string) => string
  className?: string
}) {
  const editable = descriptionForEditing(value, format)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <EditableText
        label="Description"
        value={editable}
        display={stripNaddrs(editable).trim()}
        displayNode={<RichText value={stripNaddrs(value).trim()} format={format} onCommentOn={onCommentOn} nameOf={nameOf} />}
        placeholder="Add a description…"
        onCommit={onCommit}
        multiline
        readOnly={readOnly}
        className="-mx-2 text-body-2"
      />
      {/* Any object referenced in the description, live — PRO-7. */}
      <ForeignReferences text={value} className="flex flex-col gap-2" />
    </div>
  )
}
