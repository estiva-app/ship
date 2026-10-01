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
 * Who a file is handed off to: the app whose manifest declares a shape for its
 * kind — §7.7 rule 1's owner, the one entitled to the word. The shape under
 * the word the link used comes first, in case two apps declare the kind.
 *
 * Not the projection's `appName`: that names whichever manifest *draws* the
 * kind, and on production a Peek topic is drawn as a bare file and resolves
 * with the app name "File". "Open in File" is not a hand-off.
 */
export function ownerOf<M extends Manifest & { content?: string }>(kind: number, word: string, manifests: readonly M[]): M | undefined {
  const declaring = manifests.filter((m) => fileShapesOf(m).some((s) => s.kind === kind))
  return declaring.find((m) => fileShapesOf(m).some((s) => s.kind === kind && s.word === word)) ?? declaring[0]
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

/**
 * NIP-89's `web` link for one entity — `["web", "<url with <bech32>>", "naddr"]`
 * with the entity put in. A template naming no entity type serves any.
 */
export function webLinkOf(manifest: Manifest, entity: 'naddr' | 'nevent', bech32: string): string | undefined {
  const template = manifest.tags.find((t) => t[0] === 'web' && t[1]?.includes('<bech32>') && (!t[2] || t[2] === entity))?.[1]
  return template?.replace('<bech32>', bech32)
}
