import { eventIdFromRef, identifierFromRef, matchObjectUrl, urlPatternsOf } from '@estiva-app/interop'
import { fileShapesOf, handledKinds, type Manifest } from './typeWords'

/**
 * What `/<word>/<ref>` on Ship's host names — RFC 0.5 §7.7, PRO-22.
 *
 * The path is the same on every host, so a Peek topic's link with Ship's host
 * in front still names that topic. Which kind `topic` is, Ship does not know
 * and must not: the word is the `<type>` segment of a `urls` shape some
 * manifest publishes, and the manifests are handed in. Ship's code holds no
 * table of other apps' words.
 *
 * **Matched with the interop grammar, on each manifest's own host.** §7.7 rule
 * 5 lets a server match a path against every manifest's shapes whatever host
 * they declare, so the path is put on each manifest's origin in turn and
 * `matchObjectUrl` does the matching — the slug, the uuid tail and the
 * `<d>`/`<id>` placeholders read exactly as every other consumer reads them.
 *
 * **A word nobody declares is not a dead end** (rule 4): the `d` is looked for
 * under every kind any manifest declares a `<d>` shape for. Never a bare `#d`
 * — a Folder's `39000` and its `30890` share one uuid (§7.4).
 *
 * The query is dropped. A thread link (`/topic/<slug>-<d>?thread=<id>`) names
 * a comment *inside* a topic, and what is handed off is the topic, the file.
 */
export interface FileLookup {
  /** By `#d` for an addressable file, by `ids` for an event without one. */
  by: 'd' | 'id'
  identifier: string
  /** The kinds to ask for; empty when `by` is `id`, which needs none. */
  kinds: number[]
}

/** `https://host` off a `urls` pattern, or null for one with no origin. */
function originOf(pattern: string): string | null {
  return /^https?:\/\/[^/?#]+/i.exec(pattern)?.[0] ?? null
}

export function lookupFor(word: string, ref: string, manifests: readonly Manifest[]): FileLookup | null {
  const path = `/${word}/${ref}`
  let found: FileLookup | null = null
  for (const manifest of manifests) {
    const patterns = urlPatternsOf(manifest)
    const origins = new Set(patterns.map((p) => originOf(p.pattern)).filter((o): o is string => !!o))
    for (const origin of origins) {
      const hit = matchObjectUrl(`${origin}${path}`, patterns)
      if (!hit || hit.within) continue
      if (found && (found.by !== hit.by || found.identifier !== hit.identifier)) continue
      found ??= { by: hit.by, identifier: hit.identifier, kinds: [] }
      if (hit.by === 'd') found.kinds.push(...(hit.kind !== undefined ? [hit.kind] : handledKinds(manifest)))
    }
  }
  if (found) return { ...found, kinds: [...new Set(found.kinds)] }

  const d = identifierFromRef(ref)
  if (d) {
    const kinds = manifests.flatMap((manifest) => fileShapesOf(manifest).filter((s) => s.pattern.split('?')[0].includes('<d>')).map((s) => s.kind))
    return kinds.length ? { by: 'd', identifier: d, kinds: [...new Set(kinds)] } : null
  }
  const id = eventIdFromRef(ref)
  return id ? { by: 'id', identifier: id, kinds: [] } : null
}

/**
 * The manifest whose NIP-89 `web` template made `url`, so the hand-off can
 * name the app the link actually goes to.
 *
 * **The link is the projection layer's, not chosen here.** `openUrl` comes
 * from the manifest the runtime picked for the file — the author's 31989
 * recommendation first, the same choice every reference in Ship already
 * makes. Picking a second manifest here, by relay order, would let any
 * relay member's 31990 that declares `topic` put its own host behind a link
 * labelled "Open in Peek". So the name follows the link: it is read off the
 * manifest whose template the URL was built from, and when none matches the
 * page names no app.
 *
 * Not the projection's `appName` either: on production a Peek topic is drawn
 * as a bare file and resolves as "File" — "Open in File" is not a hand-off.
 */
export function manifestOfLink<M extends Manifest>(url: string, manifests: readonly M[]): M | undefined {
  return manifests.find((m) =>
    m.tags.some((t) => {
      if (t[0] !== 'web' || !t[1]?.includes('<bech32>')) return false
      const [before, after] = t[1].split('<bech32>')
      return url.startsWith(before) && url.endsWith(after) && url.length > before.length + after.length
    }),
  )
}

/** Only an `https:` link is followed off the page; anything else is no link. */
export function safeLink(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

/** A manifest's `name`, or undefined when its content says none. */
export function appNameOf(manifest: { content?: string }): string | undefined {
  try {
    const name = (JSON.parse(manifest.content ?? '') as { name?: unknown }).name
    return typeof name === 'string' && name ? name : undefined
  } catch {
    return undefined
  }
}
