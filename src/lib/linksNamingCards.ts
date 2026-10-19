import type { LinkResolver } from '@estiva-app/protocol'

const MARKER_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g
const BARE_URL = /https?:\/\/[^\s<>"'`]+/g
const TRAILING = /[.,;:!?)\]]+$/

/**
 * The URLs that may name a card: each link's target and each bare URL, never a
 * URL written in a link's label: `[https://ship…/issue/x](https://elsewhere)`
 * must never put that issue's card under a link that goes elsewhere (OPT-17's
 * security review). A link on words counts its target, as `cardsIn` does since
 * protocol 0.40. Peek's `findUrls` answers the same.
 *
 * At most `MAX_LINKS_PER_MESSAGE`, the first ones in that order, as Peek asks:
 * each claimed link is a relay query, and a message with hundreds would spend
 * every viewer's quota (OPT-18's security review). The rest stay links.
 *
 * Read by the writer and the reader alike, so the card a comment is sent with
 * is one its readers draw (WBM-7).
 */
export function linksNamingCards(body: string): Set<string> {
  const out = new Set<string>()
  for (const match of body.matchAll(MARKER_LINK)) if (/^https?:/i.test(match[1])) out.add(match[1])
  for (const url of body.replace(MARKER_LINK, ' ').match(BARE_URL) ?? []) out.add(url.replace(TRAILING, ''))
  return new Set([...out].slice(0, MAX_LINKS_PER_MESSAGE))
}

/** How many of a message's links are asked what they name — Peek's `MAX_LINKS_PER_MESSAGE`. */
export const MAX_LINKS_PER_MESSAGE = 8

/** A `LinkResolver` for one message: what `known` says, for a URL that may name a card in its body. */
export function linkResolverFor(body: string, known: LinkResolver): LinkResolver {
  const named = linksNamingCards(body)
  return (url) => (named.has(url) ? known(url) : undefined)
}
