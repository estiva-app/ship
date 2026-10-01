import { useEffect, useState } from 'react'
import { addrToNaddr, encodeNevent, type SignedEvent } from '@estiva-app/protocol'
import { appNameOf, lookupFor, ownerOf, webLinkOf } from '@/lib/handoff'
import { isOwnKind } from '@/lib/ownKinds'
import { resolveForeign, type ForeignObject } from './foreign'
import { relay } from './store'

/**
 * Another app's file, opened on Ship's host — the relay half of PRO-22.
 *
 * `lookupFor` says what the path names; this asks the relay for it and says
 * one of four things, which the page never collapses:
 *
 * - **`own`** — the file is Ship's after all: a word nobody declares that
 *   found a project or an issue (§7.7 rule 4). The page moves to Ship's own
 *   route for it, the way a stale slug is refreshed.
 * - **`found`** — another app's file, resolved through the projection layer
 *   exactly as a reference in a comment is, so its title, its app and the
 *   link that opens it there come from that app's manifest (`web`).
 * - **`unclaimed`** — the file is on the relay and no app says how to open it.
 * - **`missing`** — nothing answered. A gated Folder returns the same nothing
 *   as an absent file, so the page says both.
 */
export type Handoff =
  | { state: 'own'; kind: number; d: string }
  /** `app` and `openUrl` are the owner's — its manifest's name and `web` link. */
  | { state: 'found'; object: ForeignObject; app?: string; openUrl?: string }
  | { state: 'unclaimed' }
  | { state: 'missing' }

/**
 * Every manifest on the relay, once per tab.
 *
 * A manifest changes when an app republishes it, which is rare and never
 * mid-visit; the hand-off is the only reader. A failed read is forgotten, so
 * the next hand-off asks again rather than inheriting the failure.
 */
let manifests: Promise<SignedEvent[]> | null = null
function declaredManifests(): Promise<SignedEvent[]> {
  manifests ??= relay.query([{ kinds: [31990], limit: 100 }] as never).catch((error: unknown) => {
    manifests = null
    throw error
  })
  return manifests
}

export async function resolveHandoff(word: string, ref: string): Promise<Handoff> {
  const all = await declaredManifests()
  const lookup = lookupFor(word, ref, all)
  if (!lookup || (lookup.by === 'd' && lookup.kinds.length === 0)) return { state: 'missing' }
  const filter = lookup.by === 'd' ? { kinds: lookup.kinds, '#d': [lookup.identifier], limit: 10 } : { ids: [lookup.identifier], limit: 1 }
  const [event] = (await relay.query([filter] as never)).sort((a, b) => b.created_at - a.created_at)
  if (!event) return { state: 'missing' }
  if (lookup.by === 'd' && isOwnKind(event.kind)) return { state: 'own', kind: event.kind, d: lookup.identifier }
  const address = `${event.kind}:${event.pubkey}:${lookup.identifier}`
  const object = await resolveForeign(lookup.by === 'd' ? address : event.id)
  if (!object) return { state: 'unclaimed' }
  // The owner's own link, per §7.7 rule 2; the projection's is the fallback.
  const owner = ownerOf(event.kind, word, all)
  const app = owner ? appNameOf(owner) : undefined
  const openUrl = (owner && (lookup.by === 'd' ? webLinkOf(owner, 'naddr', addrToNaddr(address)) : webLinkOf(owner, 'nevent', encodeNevent({ id: event.id, relays: [] })))) ?? object.openUrl
  return { state: 'found', object, ...(app ? { app } : {}), ...(openUrl ? { openUrl } : {}) }
}

/** `resolveHandoff` for a page: `undefined` while it runs, `failed` if it threw. */
export function useHandoff(word: string, ref: string): Handoff | 'failed' | undefined {
  const [answer, setAnswer] = useState<{ key: string; value: Handoff | 'failed' } | undefined>(undefined)
  const key = `${word}/${ref}`
  useEffect(() => {
    let cancelled = false
    resolveHandoff(word, ref).then(
      (value) => !cancelled && setAnswer({ key, value }),
      () => !cancelled && setAnswer({ key, value: 'failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [word, ref, key])
  // An answer about the previous path is no answer about this one.
  return answer?.key === key ? answer.value : undefined
}
