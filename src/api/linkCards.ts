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
 * under a link to another's. A link to one block names its part (§13.6.1),
 * not a card.
 *
 * Asked once per link for the tab: a link names the same object for as long as
 * its owner's manifest does. A read that failed is forgotten, so the next ask
 * tries again.
 */
import { useEffect, useState } from 'react'
import { matchObjectUrl, urlPatternsOf } from '@estiva-app/interop'
import type { SignedEvent } from '@estiva-app/protocol'
import { declaredManifests } from './handoff'
import { relay } from './store'

const EVENT_ID = /^[0-9a-f]{64}$/i

/** The `embed` value an app link names — an address, or a message's event id — or null. Throws when the relay could not be asked. */
async function cardValueOf(url: string): Promise<string | null> {
  const shapes = (await declaredManifests()).flatMap((manifest) => urlPatternsOf(manifest))
  const hit = matchObjectUrl(url, shapes)
  if (!hit || hit.block !== undefined) return null
  if (hit.by === 'id') return EVENT_ID.test(hit.identifier) ? hit.identifier.toLowerCase() : null
  const filter: Record<string, unknown> = { '#d': [hit.identifier], limit: 2 }
  if (hit.kind !== undefined) filter.kinds = [hit.kind]
  const found: SignedEvent[] = await relay.query([filter] as never)
  const authors = new Set(found.map((event) => `${event.kind}:${event.pubkey}`))
  return authors.size === 1 ? `${[...authors][0]}:${hit.identifier}` : null
}

const asked = new Map<string, Promise<string | null>>()
const known = new Map<string, string | null>()

function ask(url: string): Promise<string | null> {
  let value = asked.get(url)
  if (!value) {
    value = cardValueOf(url).then(
      (answer) => {
        known.set(url, answer)
        return answer
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
