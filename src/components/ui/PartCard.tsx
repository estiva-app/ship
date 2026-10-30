import { serializeBlockDocument } from '@estiva-app/protocol'
import { Button, PartCard as KitPartCard, thingKindOf } from '@estiva-app/ui'
import { IconExternalLink } from '@tabler/icons-react'
import { usePart, type PartView } from '@/api/part'
import { linkedOf } from '@/lib/linked'
import { navigateTo } from '@/router'
import { ShipRichText } from './ShipRichText'

/**
 * Past this height a block is cut behind ShowMore's fade, and opens in place.
 * Peek's figure: about six table rows, so a short table is still drawn whole.
 */
const CUT_AT = 160

/**
 * One block of another object, live inside a message (SPEC §13.6.1, COM-2); reads it and draws it.
 *
 * @registry namesake: reads the part from the relay and draws its blocks inside the package's PartCard, which draws only the frame — as Peek's does.
 */
export function PartCard({ address, block, nameOf }: { address: string; block: string; nameOf?: (pubkey: string) => string }) {
  return <PartCardView view={usePart({ address, block })} address={address} block={block} nameOf={nameOf} />
}

/** Where a part's link opens: a path of Ship's own, so it opens in place, or another app's https address. */
function placeOf(link: string | undefined): { href: string; here: boolean } | undefined {
  if (!link) return undefined
  try {
    const url = new URL(link)
    if (url.origin === window.location.origin) return { href: url.pathname + url.search + url.hash, here: true }
    return /^https?:$/.test(url.protocol) ? { href: url.href, here: false } : undefined
  } catch {
    return undefined
  }
}

/**
 * One block of another object, drawn from a read that has already happened.
 *
 * Peek's `PartCard`, by design the same in both apps (COM-2), in the kit's
 * frame (ui 0.75): the title of what it is part of and its key, then the block — whole when it
 * is short; cut behind ShowMore's fade when it is long, and opened in place
 * (Katerina, 2026-10-08). The way into the app it came from is a Button with an
 * open-out icon, level with Show more.
 *
 * The SPEC's five states (§13.6.1), as the kit's `PartCardState` draws them
 * (ui 0.92): not this reader's to see says "not available"; deleted, as a
 * trusted deletion naming what it is part of says, says "deleted"; a block gone
 * from a file still there, and a file with no blocks, say so in the SPEC's
 * words, the second opening the whole file. Neither of the first two shows a
 * title, which would tell a reader something about a Folder they are not in.
 */
export function PartCardView({ view, address, block, nameOf }: { view: PartView; address: string; block: string; nameOf?: (pubkey: string) => string }) {
  // What it is part of, by its icon, known from the address before anything is read.
  const kind = thingKindOf(Number(address.split(':')[0]))
  if (view.state === 'loading') {
    return (
      <div data-part="loading" data-part-address={address}>
        <KitPartCard state="loading" kind={kind} />
      </div>
    )
  }
  if (view.state === 'unreadable' || view.state === 'deleted') {
    return (
      <div data-part={view.state} data-part-address={address}>
        <KitPartCard state={view.state === 'deleted' ? 'deleted' : 'unavailable'} kind={kind} noun={kind[0].toUpperCase() + kind.slice(1)} />
      </div>
    )
  }

  const place = placeOf(view.link)
  // The title alone, and its key under it ("A part of ABC-2"): the tile already says what it is (Katerina, 30 Oct).
  const { title, key, href } = linkedOf(view.object)
  const frame = { kind: thingKindOf(view.object.kind), heading: title, partKey: key, href: place?.href }

  if (view.state !== 'resolved') {
    return (
      <div data-part={view.state} data-part-address={address}>
        {/* A file with no blocks opens whole; a deleted block leads nowhere. */}
        <KitPartCard state={view.state} kind={frame.kind} {...(view.state === 'unaddressable' && href ? { href } : {})} />
      </div>
    )
  }

  // A Button, not a Link, by Katerina's call (2026-10-08): the way out reads as
  // an action, level with Show more at the right of its row.
  const openIn = place ? (
    <Button size="small" leadingIcon={<IconExternalLink stroke={1.5} className="size-3.5" />} onClick={() => (place.here ? navigateTo(place.href) : window.open(place.href, '_blank', 'noopener,noreferrer'))}>
      {/* "Open" when it stays in Ship; "in <app>" only when it takes you elsewhere (Miky, 2026-10-09). */}
      {place.here ? 'Open' : `Open in ${view.object.appName ?? 'app'}`}
    </Button>
  ) : undefined
  return (
    <div data-part="resolved" data-part-address={address} data-part-block={block}>
      {/* The kit's PartCard draws Show more and Open in on one row under the
          block, outside its quote bar (ui 0.91.1; Katerina, 30 Oct). An
          attachment is never cut (no height reaches Infinity): its card is
          already the thumbnail, and a click on it opens the full picture as it
          does on a message's own. */}
      <KitPartCard {...frame} action={openIn} maxHeight={view.block.type === 'attachment' ? Infinity : CUT_AT}>
        <ShipRichText value={serializeBlockDocument({ type: 'doc', content: [view.block] })} format="blocks" size="small" nameOf={nameOf} />
      </KitPartCard>
    </div>
  )
}
