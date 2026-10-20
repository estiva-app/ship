import type { ForeignObject } from '@estiva-app/interop'
import { KIND } from '../nostr/kinds'
import { isOwnKind } from './ownKinds'
import { href } from '@/router'
import { safeLink } from './handoff'

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
 * - **another app's object** — the `openUrl` its manifest gave, the same field
 *   the attachment card already follows. Peek's `web` template is
 *   `/o/<bech32>`, so a topic or a message mentioned here opens in Peek.
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
  // Another app's manifest wrote it, so only an `https:` link is followed.
  const link = safeLink(object.openUrl)
  return link ? { place: 'app', href: link } : null
}

/*
  The origins the manifests declare, for render, where nothing can await:
  `api/handoff.ts` fills it each time it reads the manifests, which it does
  before any pasted link resolves to a file.
*/
let declaredOrigins: readonly string[] = []

/** What the manifests declare — from `declaredManifests`, once they have been read. */
export function rememberDeclaredOrigins(origins: readonly string[]): void {
  declaredOrigins = origins
}

/**
 * Where a chip written as a URL opens: the address as written, in the app it
 * names (SPEC §7.7, LTX-6) — so `leaf.estiva.app/issue/…` opens Leaf, not
 * Ship's own page, and a link to one block lands on the block, not the top of
 * its file (§13.6.1, WBM-11). Undefined for anything but `https:`, and for a
 * host no app declares, which open where {@link referenceLink} says: a chip
 * that draws one file never opens a site no app serves from (WBM-11 security
 * review). `opens` is where the file itself opens, and its origin counts as
 * declared. Ship's own URL is a path for the router, and the issue page
 * scrolls to the block it names.
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-files-path-is-the-same-on-every-apps-host.md
 */
export function writtenLinkOf(
  url: string | undefined,
  opens: string | undefined,
  origin = window.location.origin,
  declared: readonly string[] = declaredOrigins,
): ReferenceLink | undefined {
  const link = safeLink(url)
  if (!link || !opens) return undefined
  const parsed = new URL(link)
  let opensHere: boolean
  try {
    const opensAt = new URL(opens, origin).origin
    opensHere = opensAt === origin
    if (parsed.origin !== origin && parsed.origin !== opensAt && !declared.includes(parsed.origin)) return undefined
  } catch {
    return undefined
  }
  // Ship's own file written on Ship's host already opens here, at its route; only a block (not `#/…`, an old hash
  // route) changes where.
  if (opensHere && parsed.origin === origin && (parsed.hash.length < 2 || parsed.hash.startsWith('#/'))) return undefined
  return parsed.origin === origin ? { place: 'here', href: `${parsed.pathname}${parsed.search}${parsed.hash}` } : { place: 'app', href: link }
}
