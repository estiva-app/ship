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

/**
 * Ask what each of these links names, and draw again as the answers come back.
 * Returns the values known so far, by URL — the objects whose cards the surface
 * resolves with the rest of its references.
 */
export function useLinkValues(urls: readonly string[]): ReadonlyMap<string, string> {
  useLinksAnswered()
  const key = urls.join('\n')
  useEffect(() => {
    // A failed read is said as a change later (the reader's retry), and this asks again then.
    if (key) void links.ask(key.split('\n')).catch(() => {})
  }, [key])
  const out = new Map<string, string>()
  for (const url of urls) {
    const value = links.known(url)
    if (value) out.set(url, value)
  }
  return out
}
