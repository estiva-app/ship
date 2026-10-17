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
