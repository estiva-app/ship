import { useEffect, useState } from 'react'
import type { SignedEvent } from '@estiva-app/protocol'
import { appNameOf, declaredOriginsOf, lookupFor, manifestOfLink, safeLink, samePathOn } from '@/lib/handoff'
import { rememberDeclaredOrigins } from '@/lib/referenceLink'
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
  /**
   * `openUrl` is the projection's link, `https:` only; `app` is the name of
   * the manifest whose `web` template built it (`manifestOfLink`).
   */
  | { state: 'found'; object: ForeignObject; app?: string; openUrl?: string }
  | { state: 'unclaimed' }
  | { state: 'missing' }

/**
 * Every manifest on the relay, once per tab.
 *
 * A manifest changes when an app republishes it, which is rare and never
 * mid-visit; the hand-off is the only reader. A failed read is forgotten, and
 * so is an empty one — a relay always holds at least Ship's own manifest, so
 * none means the read did not really answer, and keeping it would make every
 * hand-off in the tab say "Nothing found" until a reload.
 */
let manifests: Promise<SignedEvent[]> | null = null
export function declaredManifests(): Promise<SignedEvent[]> {
  manifests ??= relay.query([{ kinds: [31990], limit: 500 }] as never).then(
    (found) => {
      if (found.length === 0) manifests = null
      // The same read answers which hosts a chip may open as written (LTX-6); render reads it, where it cannot await.
      rememberDeclaredOrigins(declaredOriginsOf(found))
      return found
    },
    (error: unknown) => {
      manifests = null
      throw error
    },
  )
  return manifests
}

export async function resolveHandoff(word: string, ref: string, query?: string): Promise<Handoff> {
  const all = await declaredManifests()
  const lookup = lookupFor(word, ref, all)
  if (!lookup || (lookup.by === 'd' && lookup.kinds.length === 0)) return { state: 'missing' }
  // Asks for two: a `d` two authors (or two kinds) hold names nothing (§13.1, OPT-19), as Leaf's `addressOfPath`
  // reads it — taking the newest would hand the page to a member who published the same `(kind, d)` later (LTX-6
  // security review).
  const filter = lookup.by === 'd' ? { kinds: lookup.kinds, '#d': [lookup.identifier], limit: 2 } : { ids: [lookup.identifier], limit: 1 }
  const found = await relay.query([filter] as never)
  if (new Set(found.map((held) => `${held.kind}:${held.pubkey}`)).size > 1) return { state: 'missing' }
  const [event] = found
  if (!event) return { state: 'missing' }
  if (lookup.by === 'd' && isOwnKind(event.kind)) return { state: 'own', kind: event.kind, d: lookup.identifier }
  const object = await resolveForeign(lookup.by === 'd' ? `${event.kind}:${event.pubkey}:${lookup.identifier}` : event.id)
  if (!object) return { state: 'unclaimed' }
  const projected = safeLink(object.openUrl)
  const owner = projected ? manifestOfLink(projected, all) : undefined
  const app = owner ? appNameOf(owner) : undefined
  // The same path and query on the owner's host when it serves that shape, so
  // a thread link opens on its comment; the projection's link otherwise.
  const openUrl = (owner && safeLink(samePathOn(owner, word, ref, query))) ?? projected
  return { state: 'found', object, ...(app ? { app } : {}), ...(openUrl ? { openUrl } : {}) }
}

/** `resolveHandoff` for a page: `undefined` while it runs, `failed` if it threw. */
export function useHandoff(word: string, ref: string, query?: string): Handoff | 'failed' | undefined {
  const [answer, setAnswer] = useState<{ key: string; value: Handoff | 'failed' } | undefined>(undefined)
  const key = `${word}/${ref}?${query ?? ''}`
  useEffect(() => {
    let cancelled = false
    resolveHandoff(word, ref, query).then(
      (value) => !cancelled && setAnswer({ key, value }),
      () => !cancelled && setAnswer({ key, value: 'failed' }),
    )
    return () => {
      cancelled = true
    }
  }, [word, ref, query, key])
  // An answer about the previous path is no answer about this one.
  return answer?.key === key ? answer.value : undefined
}
