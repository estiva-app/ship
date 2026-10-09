import { serializeBlockDocument } from '@estiva-app/protocol'
import { Button, Card, Link, ShowMore } from '@estiva-app/ui'
import { IconExternalLink } from '@tabler/icons-react'
import { usePart, type PartView } from '@/api/part'
import type { ForeignObject } from '@/api/foreign'
import { typeLabelOf } from '@/lib/typeLabel'
import { navigateTo } from '@/router'
import { ShipRichText } from './ShipRichText'
import { SkeletonBar } from './Skeleton'

/**
 * Past this height a block is cut behind ShowMore's fade, and opens in place.
 * Peek's figure: about six table rows, so a short table is still drawn whole.
 */
const CUT_AT = 160

/** One block of another object, live inside a message (SPEC §13.6.1, COM-2); reads it and draws it. */
export function PartCard({ address, block, nameOf }: { address: string; block: string; nameOf?: (pubkey: string) => string }) {
  return <PartCardView view={usePart({ address, block })} address={address} block={block} nameOf={nameOf} />
}

/**
 * One block of another object, drawn from a read that has already happened.
 *
 * Peek's `PartCard`, by design the same in both apps (COM-2): the object's type
 * and title, then the block — whole when it is short; cut behind ShowMore's
 * fade when it is long, and opened in place (Katerina, 2026-10-08). The way into
 * the app it came from is a Button with an open-out icon, level with Show more.
 *
 * **Five states, and two of them must never look alike.** A block somebody
 * deleted says so; a block the reader may not see says only that it is not
 * available — no title and no text, because either would tell them something
 * about a Folder they are not in, and a dashed frame so that "gone" and "not
 * yours" cannot be mistaken for each other. Every state that shows no block is
 * said in italic.
 */
export function PartCardView({ view, address, block, nameOf }: { view: PartView; address: string; block: string; nameOf?: (pubkey: string) => string }) {
  if (view.state === 'loading') return <SkeletonBar className="h-16 w-full" data-part="loading" />

  if (view.state === 'unreadable') {
    // The package's look for something that could not be read: a dashed hairline.
    return (
      <Card fill="inset" unreadable data-part="unreadable" data-part-address={address} className="px-3 py-2">
        <span className="text-caption italic text-text-muted">Not available to you</span>
      </Card>
    )
  }
  if (view.state === 'deleted') {
    return (
      <Card fill="inset" data-part="deleted" data-part-address={address} className="px-3 py-2">
        <span className="text-caption italic text-text-muted">Deleted</span>
      </Card>
    )
  }

  const heading = headingOf(view.object)
  const link = view.link
  // Ship's own issue or project changes page in place; another app's opens beside it.
  const here = link ? sameOrigin(link) : false
  const source = (
    <span className="contents text-h5 text-text-primary">
      {link ? (
        <Link href={link} variant="quiet" external={!here} truncate>
          {heading}
        </Link>
      ) : (
        heading
      )}
    </span>
  )

  if (view.state !== 'resolved') {
    return (
      <Card fill="inset" data-part={view.state} data-part-address={address} className="flex flex-col gap-3 px-3 py-2">
        {source}
        <span className="text-caption italic text-text-muted">{view.state === 'detached' ? 'This part was deleted' : "This part can't be shown"}</span>
      </Card>
    )
  }

  // A Button, not a Link, by Katerina's call (2026-10-08): the way out reads as
  // an action, level with Show more at the right of its row.
  const openIn = link ? (
    <Button size="small" leadingIcon={<IconExternalLink stroke={1.5} className="size-3.5" />} onClick={() => (here ? navigateTo(new URL(link).pathname + new URL(link).hash) : window.open(link, '_blank', 'noopener,noreferrer'))}>
      Open in {view.object.appName ?? 'app'}
    </Button>
  ) : undefined
  return (
    <Card fill="inset" data-part="resolved" data-part-address={address} data-part-block={block} className="flex flex-col gap-3 p-3">
      {source}
      {/* An attachment is never cut (no height reaches Infinity): its card is
          already the thumbnail, and a click on it opens the full picture as it
          does on a message's own. ShowMore still draws the row for Open in. */}
      <ShowMore surface="inset" maxHeight={view.block.type === 'attachment' ? Infinity : CUT_AT} action={openIn}>
        <ShipRichText value={serializeBlockDocument({ type: 'doc', content: [view.block] })} format="blocks" size="small" nameOf={nameOf} />
      </ShowMore>
    </Card>
  )
}

function sameOrigin(link: string): boolean {
  try {
    return new URL(link).origin === window.location.origin
  } catch {
    return false
  }
}

/** "Issue · Plan the launch": what it is, then which one (label objects by type, PRO-24). */
function headingOf(object: ForeignObject): string {
  const label = typeLabelOf(object)
  const title = object.slots.title?.isPubkey ? undefined : object.slots.title?.value
  return [label, title].filter(Boolean).join(' · ') || 'Untitled'
}
