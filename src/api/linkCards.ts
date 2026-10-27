/**
 * What an app link names, for Ship — SPEC §7.7, §13.1, §13.6 (PEEKM-7).
 *
 * One `linkReader` from `@estiva-app/interop` per tab, over Ship's relay and
 * the manifests the hand-off already reads: the chip a pasted link becomes,
 * the card and the live block under a message, the `a`/`q`/`part` tags a send
 * or an edit carries, and where a link written as a URL opens. Peek and Leaf
 * read links through the same reader, so a link names the same object in every
 * app; what used to be Ship's own copy here (no retry, every kind asked) is
 * gone. This module only builds the reader and shapes it for Ship's hooks.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/an-edit-says-what-the-message-links-now.md
 */
import { useEffect, useSyncExternalStore } from 'react'
import { linkReader } from '@estiva-app/interop'
import { writtenLinkOf, type ReferenceLink } from '@/lib/referenceLink'
import { declaredManifests } from './handoff'
import { relay } from './store'

/** Ship's one link reader: reads as the signed-in viewer, from the manifests read once per tab. */
export const links = linkReader({ query: (filters) => relay.query(filters as never), manifests: () => declaredManifests() })

/** What a link names, from what has come back: undefined until it has, and for nothing. A `LinkResolver`. */
export const knownLinkValue = links.known

/** The file and block a link to one block names, from what has come back. */
export const knownBlockOf = links.knownBlock

/** Ask what each of these links names; rejects when a read failed, so a `LinkChips` asks again. */
export const askLinkValues = links.ask

/** Called whenever a link's answer comes back, or a failed one may be asked again. */
export const linksChanged = links.changed

/** Where a chip or card written as a URL opens, here: `writtenLinkOf` against the hosts the manifests declare. */
export function writtenLink(url: string | undefined, opens: string | undefined): ReferenceLink | undefined {
  return writtenLinkOf(url, opens, window.location.origin, links.declaredOrigins())
}

/** Draws again each time a link's answer comes back. */
export function useLinksAnswered(): number {
  return useSyncExternalStore(links.changed, links.version)
}

/** How often one link is asked about in a tab: the first ask and the reader's retries (interop's three). */
const ASKS_PER_LINK = 4
/**
 * How long a failed link waits before it is asked again: just under the
 * reader's own retry (5, 10, 20 s), so its `changed` finds the wait over while
 * another link's answer, a moment after the failure, does not.
 */
const RETRY_WAIT_MS = 4000
const asks = new Map<string, number>()
const asking = new Set<string>()
const waitUntil = new Map<string, number>()

/**
 * Ask what each of these links names, and ask again when the reader says a
 * failed one may be asked again: its retry only says so (`changed`), it asks
 * nothing itself, so a link whose first read was refused (a 429 on load) stayed
 * raw until the page was reloaded. A failed link waits out its back-off, and
 * each link is asked at most `ASKS_PER_LINK` times a tab, so an answer about
 * another link never makes a failing one cost another relay read. Returns the
 * reader's version.
 */
export function useAskLinks(urls: readonly string[]): number {
  const version = useLinksAnswered()
  const key = urls.join('\n')
  useEffect(() => {
    if (!key) return
    for (const url of key.split('\n')) {
      if (links.answered(url) || asking.has(url) || (asks.get(url) ?? 0) >= ASKS_PER_LINK) continue
      if (Date.now() < (waitUntil.get(url) ?? 0)) continue
      const asked = (asks.get(url) ?? 0) + 1
      asks.set(url, asked)
      asking.add(url)
      // A failed read is said as a change later (the reader's retry), and this effect asks again then.
      void links
        .ask([url])
        .catch(() => waitUntil.set(url, Date.now() + RETRY_WAIT_MS * 2 ** (asked - 1)))
        .finally(() => asking.delete(url))
    }
  }, [key, version])
  return version
}

/**
 * Ask what each of these links names, and draw again as the answers come back.
 * Returns the values known so far, by URL — the objects whose cards the surface
 * resolves with the rest of its references.
 */
export function useLinkValues(urls: readonly string[]): ReadonlyMap<string, string> {
  useAskLinks(urls)
  const out = new Map<string, string>()
  for (const url of urls) {
    const value = links.known(url)
    if (value) out.set(url, value)
  }
  return out
}
