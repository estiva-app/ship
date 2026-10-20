/**
 * What an app link names, for a card a message asks for — SPEC §13.6.2 and
 * §7.7 (OPT-17, Widgets). Peek's `cardValueOfUrlAsViewer`, with Ship's relay
 * and manifests.
 *
 * A link on words names its object by its URL, and a reader draws that
 * object's card only when §7.7 says the URL names it: the host and the
 * `<type>` against a published `urls` pattern, then **one author** for the
 * `d`. The `#d` query asks for two, and a `d` two authors hold names nothing,
 * so somebody publishing the same `(kind, d)` cannot put their object's card
 * under a link to another's. A link to one block names its file (§7.7), so it
 * reads as that file's chip; its `part` draws the block under the message and
 * keeps the file's card off (WBM-11).
 *
 * Asked once per link for the tab: a link names the same object for as long as
 * its owner's manifest does. A read that failed is forgotten, so the next ask
 * tries again.
 */
import { useEffect, useState } from 'react'
import { matchObjectUrl, urlPatternsOf } from '@estiva-app/interop'
import type { PartPointer, SignedEvent } from '@estiva-app/protocol'
import { declaredManifests } from './handoff'
import { relay } from './store'

const EVENT_ID = /^[0-9a-f]{64}$/i

/** The `embed` value an app link names — an address, or a message's event id — or null, and the block a link to one block names. Throws when the relay could not be asked. */
async function cardValueOf(url: string): Promise<{ value: string | null; block?: string }> {
  const shapes = (await declaredManifests()).flatMap((manifest) => urlPatternsOf(manifest))
  const hit = matchObjectUrl(url, shapes)
  if (!hit) return { value: null }
  if (hit.by === 'id') return { value: EVENT_ID.test(hit.identifier) ? hit.identifier.toLowerCase() : null }
  const filter: Record<string, unknown> = { '#d': [hit.identifier], limit: 2 }
  // A path on another app's host can read as several kinds (SPEC §7.7, LTX-6): ask under each.
  const kinds = hit.kinds ?? (hit.kind === undefined ? undefined : [hit.kind])
  if (kinds) filter.kinds = kinds
  const found: SignedEvent[] = await relay.query([filter] as never)
  const authors = new Set(found.map((event) => `${event.kind}:${event.pubkey}`))
  return authors.size === 1 ? { value: `${[...authors][0]}:${hit.identifier}`, block: hit.block } : { value: null }
}

const asked = new Map<string, Promise<string | null>>()
const known = new Map<string, string | null>()
const blocks = new Map<string, string>()
const answered = new Set<() => void>()

/** Called whenever a link's answer comes back, so a box reading what its links name reads again (COMM-7). */
export function linksChanged(listener: () => void): () => void {
  answered.add(listener)
  return () => void answered.delete(listener)
}

function ask(url: string): Promise<string | null> {
  let value = asked.get(url)
  if (!value) {
    value = cardValueOf(url).then(
      (answer) => {
        known.set(url, answer.value)
        if (answer.value && answer.block !== undefined) blocks.set(url, answer.block)
        answered.forEach((listener) => listener())
        return answer.value
      },
      () => {
        asked.delete(url)
        return null
      },
    )
    asked.set(url, value)
  }
  return value
}

/** What a link names, from what has come back: undefined until it has, and for nothing. A `LinkResolver` for `cardsIn`. */
export function knownLinkValue(url: string): string | undefined {
  return known.get(url) ?? undefined
}

/** The file and block a link to one block names, from what has come back: what `boxReadOf` draws as a live part under the box. */
export function knownBlockOf(url: string): PartPointer | undefined {
  const address = known.get(url)
  const block = blocks.get(url)
  return address && block !== undefined ? { address, block } : undefined
}

/**
 * Ask what each of these links names; settles when every answer is in. A
 * description editor's `LinkChips` asks this way. Rejects when a read failed
 * (it left no answer), so the editor forgets those links and asks again.
 */
export async function askLinkValues(urls: readonly string[]): Promise<void> {
  const waiting = urls.filter((url) => !known.has(url))
  await Promise.all(waiting.map(ask))
  if (waiting.some((url) => !known.has(url))) throw new Error('A link could not be asked about; asked again later.')
}

/** How many of a message's links are looked up at send — `LinkChips`' default `limit`. */
const MAX_LINKS_TAGGED = 24

/**
 * The tags a message earns for the app links in its body (SPEC §13.1, OPT-19):
 * an `a` per address a link names, a `q` per message — the index half of a
 * link, as `referenceTagsFor` is for a `nostr:` reference, so the object lists
 * the message under "Mentioned in". Peek's `urlReferenceTagsAsViewer`.
 *
 * Asked at send, from the answers the box's chips already asked for; a link
 * that names nothing, or whose read failed, earns nothing and the body keeps it.
 */
export async function linkReferenceTagsFor(urls: readonly string[]): Promise<string[][]> {
  // The first links only, as the box's `LinkChips` asks about (its `limit`): each answer can cost a relay query.
  const values = await Promise.all([...new Set(urls)].slice(0, MAX_LINKS_TAGGED).map(ask))
  const tags = new Map<string, string[]>()
  for (const value of values) {
    if (!value) continue
    const tag = EVENT_ID.test(value) ? ['q', value] : ['a', value]
    tags.set(tag.join(':'), tag)
  }
  return [...tags.values()]
}

/**
 * Ask what each of these links names, and draw again as the answers come back.
 * Returns the values known so far, by URL — the objects whose cards the surface
 * resolves with the rest of its references.
 */
export function useLinkValues(urls: readonly string[]): ReadonlyMap<string, string> {
  const key = urls.join('\n')
  const [, setAnswered] = useState(0)
  useEffect(() => {
    let live = true
    const waiting = key ? key.split('\n').filter((url) => !known.has(url)) : []
    if (waiting.length === 0) return
    void Promise.all(waiting.map(ask)).then(() => {
      if (live) setAnswered((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [key])
  const out = new Map<string, string>()
  for (const url of urls) {
    const value = known.get(url)
    if (value) out.set(url, value)
  }
  return out
}
