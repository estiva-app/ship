import { useMemo } from 'react'
import { KIND, resolveCommentAnchor, serializeBlockDocument } from '@estiva-app/protocol'
import { PartCard as KitPartCard, QuotedLine, thingKindOf } from '@estiva-app/ui'
import { usePart, type PartView } from '@/api/part'
import type { ForeignObject } from '@/api/foreign'
import { linkedOf } from '@/lib/linked'
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

/**
 * The words a comment written on a selection quotes (LEAF-7), as Leaf draws them: the kit's `QuotedLine`, in the
 * page's highlight while they are still in the file, "Changed since" once they are not, struck through once their
 * blocks are gone (SPEC §13.6). The words open the file at that spot (Miky, 10 Nov, ONE-12). Read on the same poll
 * the block's card would make, and resolved against the file the read hands back, so it costs no read of its own.
 * Until the file is read, the words show on the grey with no claim about them. A file deleted, not the reader's to
 * see, or with no parts says so in the part card's words, as before.
 *
 * @registry namesake: reads the part from the relay and draws the kit's QuotedLine, as Peek's comment card does.
 */
export function QuotedPart({ address, block, words, tags, nameOf }: { address: string; block: string; words: string; tags: string[][]; nameOf?: (pubkey: string) => string }) {
  const view = usePart({ address, block })
  const read = view.state === 'resolved' || view.state === 'detached' || view.state === 'unaddressable' ? view : undefined
  const body = read?.object.slots.body
  const tagsKey = JSON.stringify(tags)
  const anchor = useMemo(
    () => (body ? resolveCommentAnchor({ kind: KIND.COMMENT, tags: JSON.parse(tagsKey) as string[][] }, body.value, body.format === 'blocks' ? 'blocks' : 'marker').state : undefined),
    [body, tagsKey],
  )
  const state = anchor === 'resolved' ? 'here' : anchor === 'reworded' ? 'reworded' : anchor === 'detached' ? 'gone' : undefined
  if (view.state === 'loading') {
    return (
      <div data-quoted-part="loading" data-part-address={address}>
        <QuotedLine label={words} />
      </div>
    )
  }
  if (!read || !state) return <PartCardView view={view} address={address} block={block} nameOf={nameOf} />
  // The words' spot while the block it opens at stands; the file itself once it is gone, never a spot that is not there.
  const place = view.state === 'resolved' && state !== 'gone' ? placeOf(view.link) : fileLinkOf(read.object)
  return (
    <div data-quoted-part={state} data-part-address={address} data-part-block={block}>
      <QuotedLine words={words} state={state} href={place?.href} external={place ? !place.here : undefined} />
    </div>
  )
}

/** Where a file itself opens: a path of Ship's own in place, another app's https address in a new tab. */
function fileLinkOf(object: ForeignObject): { href: string; here: boolean } | undefined {
  const { href } = linkedOf(object)
  if (!href) return undefined
  return href.startsWith('/') ? { href, here: true } : placeOf(href)
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
 * (Katerina, 2026-10-08). The way into the app it came from is its title: a
 * path of Ship's own opens in place, another app's in a new tab. There is no
 * "Open" button beside it, which said again what the title does (Katerina, 31 Oct).
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

  return (
    <div data-part="resolved" data-part-address={address} data-part-block={block}>
      {/* An attachment is never cut (no height reaches Infinity): its card is
          already the thumbnail, and a click on it opens the full picture as it
          does on a message's own. */}
      <KitPartCard {...frame} maxHeight={view.block.type === 'attachment' ? Infinity : CUT_AT}>
        <ShipRichText value={serializeBlockDocument({ type: 'doc', content: [view.block] })} format="blocks" size="small" nameOf={nameOf} />
      </KitPartCard>
    </div>
  )
}
