/**
 * One block of another object, shown live in a message — SPEC §13.6.1, COM-2.
 * Peek's `src/api/part.ts`, with Ship's relay and manifests.
 *
 * **Pointer, never copy.** The block is read from its object every time this
 * runs and held only in this module's polls, for the life of the view: nothing
 * here writes it to a draft, a cache that outlives the card, or a preview.
 * A copy would go stale, and would keep showing the text to somebody who has
 * since lost access to the Folder it came from.
 *
 * **Live by re-reading.** Neither the object's Folder nor its `h` is known
 * before the first read — the pointer carries neither, by decision — so the
 * workspace socket cannot be keyed on it. A shown part reads again on an
 * interval while the tab is visible, and when the tab comes back.
 */
import { useEffect, useState } from 'react'
import { absenceOf, partTag, resolvePart, type Block, type NostrTag, type PartPointer, type SignedEvent } from '@estiva-app/protocol'
import { blockUrlOf, matchObjectUrl, urlPatternsOf } from '@estiva-app/interop'
import { pausedForMs } from '@/lib/relayBudget'
import { resolveForeign, type ForeignObject } from './foreign'
import { declaredManifests } from './handoff'
import { relay } from './store'

/**
 * How often a shown part is read again while its tab is visible. One poll per
 * `address#block` however many cards show it, and the relay meters `/query`
 * per tab, so this stays well above the rate a description is edited at during
 * a conversation about it. Peek's figure.
 */
export const PART_REFRESH_MS = 30_000

/** A first read that failed is tried again this soon, rather than a whole interval later. */
const FIRST_RETRY_MS = 3_000

/** At most this many blocks are drawn live in one message (SPEC §13.6.1); the rest stay links. */
export const MAX_PARTS_PER_MESSAGE = 6

/** What a part draws. The five states of `resolvePart`, plus waiting. */
export type PartView =
  | { state: 'loading' }
  | { state: 'resolved'; block: Block; object: ForeignObject; link?: string }
  | { state: 'unaddressable' | 'detached'; object: ForeignObject; link?: string }
  | { state: 'deleted' }
  | { state: 'unreadable' }

const query = (filters: Record<string, unknown>[]): Promise<SignedEvent[]> => relay.query(filters as never)

/** Every app's inbound `urls` shapes, from the manifests the hand-off already reads once per tab. */
async function urlShapes() {
  return (await declaredManifests()).flatMap((manifest) => urlPatternsOf(manifest))
}

/** The Open link per address, title and block: it changes only on a rename, so it is built once. */
const links = new Map<string, Promise<string | undefined>>()

function blockLinkOf(address: string, title: string | undefined, block: string): Promise<string | undefined> {
  const key = `${address}\u0000${block}\u0000${title ?? ''}`
  let link = links.get(key)
  if (!link) {
    const [kind, , d] = address.split(':')
    link = d ? urlShapes().then((shapes) => blockUrlOf(shapes, { kind: Number(kind), d, title, block }), () => undefined) : Promise.resolve(undefined)
    links.set(key, link)
  }
  return link
}

/** Read one part once, as the signed-in viewer. */
export async function readPart(pointer: PartPointer): Promise<PartView> {
  const object = await resolveForeign(pointer.address)
  // `unreachable` is interop's stand-in for an address the read could not see
  // (it carries the noun from the manifest and nothing else): the same empty read.
  if (!object || object.unreachable) {
    // A Folder the viewer is not in is skipped silently, so the empty answer
    // cannot say why; a deletion somebody was entitled to make is the one thing
    // that can. None found also covers an address that never existed.
    const deletions = await query([{ kinds: [5], '#a': [pointer.address], limit: 20 }])
    return absenceOf(pointer.address, deletions) === 'deleted' ? { state: 'deleted' } : { state: 'unreadable' }
  }
  const body = object.slots.body
  // An object with no body slot has no parts Ship can see — not "deleted".
  const part = body
    ? resolvePart(pointer.block, { value: body.value, format: body.format === 'blocks' ? 'blocks' : 'marker' })
    : ({ state: 'unaddressable' } as const)
  // `resolvePart` only says deleted or unreadable when told so, and it was not.
  if (part.state === 'deleted' || part.state === 'unreadable') return { state: 'unreadable' }
  const link = (await blockLinkOf(pointer.address, object.slots.title?.value, pointer.block)) ?? object.openUrl
  return part.state === 'resolved' ? { state: 'resolved', block: part.block, object, link } : { state: part.state, object, link }
}

/** The part a message shows, kept current. `loading` until the first read. */
export function usePart(pointer: PartPointer): PartView {
  const { address, block } = pointer
  const [view, setView] = useState<PartView>({ state: 'loading' })
  useEffect(() => watchPart({ address, block }, setView), [address, block])
  return view
}

/**
 * One poll per `address#block`, however many cards show it — an issue with a
 * dozen messages pointing at one paragraph is read once per tick — and none
 * while the relay has asked this tab to pause (`relayBudget`, PER-13).
 */
interface Poll {
  listeners: Set<(view: PartView) => void>
  last?: PartView
  stop: () => void
}
const polls = new Map<string, Poll>()

function watchPart(pointer: PartPointer, listener: (view: PartView) => void): () => void {
  const key = `${pointer.address}\u0000${pointer.block}`
  let poll = polls.get(key)
  if (!poll) {
    const created: Poll = { listeners: new Set(), stop: () => undefined }
    let retry: ReturnType<typeof setTimeout> | undefined
    const read = () => {
      if (document.visibilityState === 'hidden') return
      if (pausedForMs() > 0) return
      readPart(pointer)
        .then((next) => {
          created.last = next
          for (const notify of created.listeners) notify(next)
        })
        // A failed read keeps what was shown: a network blip is not a deletion.
        // Nothing shown yet means a skeleton, so try again soon rather than in a full interval.
        .catch(() => {
          if (!created.last && polls.get(key) === created) retry = setTimeout(read, FIRST_RETRY_MS)
        })
    }
    const timer = setInterval(read, PART_REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && read()
    document.addEventListener('visibilitychange', onVisible)
    created.stop = () => {
      clearInterval(timer)
      if (retry) clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
    polls.set(key, created)
    poll = created
    read()
  }
  const current = poll
  current.listeners.add(listener)
  if (current.last) listener(current.last)
  return () => {
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      current.stop()
      polls.delete(key)
    }
  }
}

/** Test seam — the polls and links are module state and a suite must not inherit them. */
export function resetParts(): void {
  for (const poll of polls.values()) poll.stop()
  polls.clear()
  links.clear()
}

/** The http(s) links in a text, as written. Trailing punctuation is the sentence's, not the link's. */
export function urlsIn(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"'`]+/g) ?? []).map((url) => url.replace(/[.,;:!?)\]]+$/, ''))
}

/**
 * Whether a pasted app link names this address: its path ends in the address's
 * `d` (§7.2 puts the identity last, `…/<slug>-<d>`), and that `d` is long enough
 * to be one. A `d` comes from somebody's tag, so a short one would otherwise
 * match half the links in the body. Peek's `urlNames`.
 */
export function urlNames(url: string, address: string): boolean {
  const d = address.split(':')[2] ?? ''
  if (d.length < 8) return false
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '')
  return path.endsWith(`-${d}`) || path.endsWith(`/${d}`)
}

/**
 * The parts a message draws: its `part` tags, only while the body still names
 * that object — an edit carries no `part`, and a person who took the link out
 * meant the card to go with it — and at most {@link MAX_PARTS_PER_MESSAGE}.
 * The body names it by a pasted app link, whose path ends in the object's `d`,
 * or by a `nostr:` pointer whose address the caller supplies.
 */
export function shownParts(parts: readonly PartPointer[] | undefined, body: string, named: ReadonlySet<string> = new Set()): PartPointer[] {
  if (!parts?.length) return []
  const urls = urlsIn(body)
  return parts.filter(({ address }) => named.has(address) || urls.some((url) => urlNames(url, address))).slice(0, MAX_PARTS_PER_MESSAGE)
}

/**
 * The tags a message earns for the block links pasted into it — SPEC §13.6.1:
 * a `part` per object, the first link's block (`partsOf` reads only the first
 * tag for an address), and an `a` beside it unless that object is the one the
 * message is on, whose `a` it already carries (NIP-22). Resolved at send rather
 * than in the composer because a URL is prose until it is sent and the address
 * needs the relay: the link names a `d`, not who wrote it.
 *
 * A link that names no block, or that nothing resolves, earns nothing; the
 * body still has it.
 */
export async function partTagsFor(body: string, own?: string): Promise<NostrTag[]> {
  const urls = [...new Set(urlsIn(body))]
  if (urls.length === 0) return []
  let shapes
  try {
    shapes = await urlShapes()
  } catch {
    return []
  }
  const hits = urls.map((url) => matchObjectUrl(url, shapes)).filter((hit) => !!hit && hit.by === 'd' && hit.block !== undefined)
  const parts = new Map<string, string>()
  for (const hit of hits) {
    if (!hit) continue
    const filter: Record<string, unknown> = { '#d': [hit.identifier], limit: 1 }
    if (hit.kind !== undefined) filter.kinds = [hit.kind]
    const [found] = await query([filter]).catch(() => [] as SignedEvent[])
    if (!found) continue
    const address = `${found.kind}:${found.pubkey}:${hit.identifier}`
    if (!parts.has(address)) parts.set(address, hit.block!)
  }
  return [...parts].flatMap(([address, block]) => (address === own ? [partTag(address, block)] : [['a', address], partTag(address, block)]))
}
