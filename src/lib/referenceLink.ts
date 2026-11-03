import { writtenOpenerOf, type ForeignObject } from '@estiva-app/interop'
import { KIND } from '../nostr/kinds'
import { isOwnKind } from './ownKinds'
import { href, parse } from '@/router'
import { safeLink } from './handoff'
import { isKnownSpace, isTopicAddress, topicHref } from './topicLinks'

/**
 * Where a reference chip leads — RIC-16.
 *
 * A mention that leads nowhere is half a mention. Where it leads is decided
 * from what the reference *resolved to*, never from the caller knowing in
 * advance, which is the same rule `Reference` draws by:
 *
 * - **one of Ship's own objects** — its page here, through the router, so the
 *   click is an in-app navigation and not a document load (SHI-20). The route
 *   is built from the address, and the slug from the title, exactly as the
 *   issue list builds it.
 * - **a topic** — its page here (SHIPS-4), unless it is a space.
 * - **another app's object** — the `openUrl` its manifest gave, the same field
 *   the attachment card already follows. Peek's `web` template is
 *   `/o/<bech32>`, so a space or a message mentioned here opens in Peek.
 * - **nothing resolved, or an object the reader may not see** — nowhere. A
 *   label is the honest answer; a link to a page that says "nothing here" is
 *   worse than no link.
 */
export type ReferenceLink =
  /** A page of this app; `href` is a path for `linkTo`. */
  | { place: 'here'; href: string }
  /** Another app; `href` is absolute and the browser follows it. */
  | { place: 'app'; href: string }

export function referenceLink(object: ForeignObject | null | undefined): ReferenceLink | null {
  if (!object || object.unreachable) return null
  if (isOwnKind(object.kind) && object.address) {
    const d = object.address.split(':')[2]
    const title = object.slots.title
    const slug = title && !title.isPubkey ? title.value : undefined
    return {
      place: 'here',
      href:
        object.kind === KIND.PROJECT
          ? href({ name: 'project', d, slug, view: 'table' })
          : href({ name: 'issue', d, slug }),
    }
  }
  // A topic has its page here too (SHIPS-4), except a space the held topics read knows, which is Peek's. One it does
  // not know yet opens the page, which sends a space on.
  if (isTopicAddress(object.address) && !isKnownSpace(object.address)) {
    const title = object.slots.title
    return { place: 'here', href: topicHref(object.address, title && !title.isPubkey ? title.value : undefined) }
  }
  // Another app's manifest wrote it, so only an `https:` link is followed.
  const link = safeLink(object.openUrl)
  return link ? { place: 'app', href: link } : null
}

/**
 * Where a chip written as a URL opens. When Ship has a page made for the
 * file's kind (`opens` is a route here: a project, an issue, a topic that is
 * no space), the link opens that page, wherever it was written, as long as the
 * page shows what the link points at: so `leaf.estiva.app/issue/…` and
 * `peek.estiva.app/topic/…` open Ship's pages, and a block of an issue opens
 * Ship's issue page at the block. A link to one message (`?thread=`), or to a
 * block of a page that has none (a topic's), opens as written, in the app it
 * names (§7.7), as does every link to a file Ship has no page for; one block
 * lands on the block, not the top of its file (§13.6.1, WBM-11). Whether it
 * opens as written is interop's `writtenOpenerOf`: `https:` only, on this
 * host, the host its file opens on (`opens`), or one an app declares
 * (`declared`, the link reader's); anything else opens where
 * {@link referenceLink} says. Ship's own URL is a path for the router, and the
 * issue page scrolls to the block it names.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind.md
 */
export function writtenLinkOf(
  url: string | undefined,
  opens: string | undefined,
  origin: string,
  declared: ReadonlySet<string> = new Set(),
): ReferenceLink | undefined {
  if (!opens) return undefined
  const link = writtenOpenerOf(url, opens, origin, declared)
  if (!link) return undefined
  const parsed = new URL(link)
  const page = new URL(opens, origin)
  // A block, not `#/…`, an old hash route.
  const block = parsed.hash.length >= 2 && !parsed.hash.startsWith('#/')
  // One message (`?thread=`) is shown by no page of Ship's: it opens as written, on Ship's host the hand-off.
  const thread = parsed.searchParams.has('thread')
  if (page.origin === origin && !thread) {
    // Written on Ship's host, it already opens here, at its route; only a block changes where.
    if (parsed.origin === origin && !block) return undefined
    // Written on another app's host, it opens Ship's page when that page shows what it points at.
    if (parsed.origin !== origin) {
      if (!block) return undefined
      const at = `${page.pathname}${page.search}${parsed.hash}`
      // A path that normalised to `//…` would be another host: as everywhere here, it opens where its file opens.
      if (parse(page.pathname).name !== 'topic') return new URL(at, origin).origin === origin ? { place: 'here', href: at } : undefined
    }
  }
  if (parsed.origin !== origin) return { place: 'app', href: link }
  // A path that starts `//` (`/\` parses the same) would read as another host once it is a route: it opens where its file opens.
  const route = `${parsed.pathname}${parsed.search}${parsed.hash}`
  return new URL(route, origin).origin === origin ? { place: 'here', href: route } : undefined
}
