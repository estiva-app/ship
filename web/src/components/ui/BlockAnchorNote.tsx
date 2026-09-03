import type { BlockAnchor } from '@estiva-app/protocol'
import { inlineTextOf } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'

/**
 * What a comment is anchored to — SPEC §13.6.
 *
 * **This component exists because of the states it draws differently, not the
 * one it draws well.** A comment anchored to a paragraph somebody has since
 * deleted and a comment about the whole object render identically if you let
 * them, and they mean opposite things. §13.6 forbids that collapse, and the
 * only way to honour it is for the failures to say something.
 *
 * - **unanchored** — nothing. It is a comment about the object, which is what
 *   every comment in the workspace has been until now.
 * - **resolved** — the text it points at, quoted, so a reader sees the remark
 *   next to its subject rather than having to find it.
 * - **detached** — *said out loud*. Something was there and is not.
 * - **unaddressable** — also said, and deliberately worded differently:
 *   nothing was deleted, this description simply has no parts (§13.1). Telling
 *   somebody a paragraph was removed when none ever existed is wrong twice.
 */
export function BlockAnchorNote({ anchor, className }: { anchor?: BlockAnchor; className?: string }) {
  if (!anchor || anchor.state === 'unanchored') return null

  if (anchor.state === 'resolved') {
    const text = inlineTextOf(anchor.block).trim()
    return (
      <div
        data-anchor="resolved"
        data-block-id={anchor.id}
        className={cn('border-l-2 border-border-strong pl-2 text-caption text-text-muted', className)}
      >
        <span className="line-clamp-2 italic">{text || 'an empty block'}</span>
      </div>
    )
  }

  /*
    Both failures get the same muted treatment and different words. Muted
    because a broken anchor is not an error the reader caused and cannot act on;
    different words because the two are different facts, and §13.6's whole point
    is that a reader must be able to tell them apart.
  */
  return (
    <div
      data-anchor={anchor.state}
      data-block-id={anchor.id}
      className={cn('border-l-2 border-border-default pl-2 text-caption text-text-muted', className)}
    >
      {anchor.state === 'detached'
        ? 'The part of the description this refers to has since been deleted.'
        : 'This refers to a part of the description, which is no longer written in parts.'}
    </div>
  )
}
