import { urlPatternsOf } from '@estiva-app/interop'

/**
 * Type words — the `<type>` segment of a manifest's `urls` shapes, RFC 0.5
 * §7.7 rule 1: a word is declared per kind by the kind's owner, and it is the
 * word on every host.
 *
 * Read here for two callers that must agree: the hand-off (`handoff.ts`),
 * which looks a path's `d` up under the kinds a word names, and
 * `scripts/publish-manifest.ts`, which refuses to publish a word another
 * manifest already uses for a different kind.
 */
export interface Manifest {
  pubkey?: string
  tags: string[][]
}

/** One shape whose path names a file: its word, its kind, the pattern. */
export interface FileShape {
  word: string
  kind: number
  pattern: string
}

/**
 * The word a `urls` pattern declares, or null.
 *
 * `https://ship.estiva.app/issue/<slug>-<d>` and the hash form Ship still
 * declares for its old links, `https://ship.estiva.app/#/issue/<d>`, both say
 * `issue`. A first segment that is a placeholder declares no word.
 */
export function typeWordOf(pattern: string): string | null {
  const path = pattern.replace(/^[a-z]+:\/\/[^/?#]+/i, '').replace(/^\/?#/, '')
  const word = path.split(/[/?]/).filter(Boolean)[0]
  return word && !word.includes('<') ? word : null
}

/** The kinds a manifest says it handles (`k`), for a shape that names none. */
export function handledKinds(manifest: Manifest): number[] {
  return manifest.tags.filter((t) => t[0] === 'k').map((t) => Number(t[1])).filter(Number.isInteger)
}

/**
 * The shapes in a manifest whose path *is* the file — one per kind.
 *
 * A shape with a placeholder in its query is left out: Peek's thread link,
 * `/topic/<slug>-<d>?thread=<id>`, is kind 1111 by its query and its path's
 * `<d>` is the topic's. Counting it would make `topic` name two kinds in one
 * manifest, and would make every word an app adds a thread shape for collide.
 * A shape that names no kind stands for each kind the manifest handles, which
 * is how `urlPatternsOf` says a consumer reads it.
 */
export function fileShapesOf(manifest: Manifest): FileShape[] {
  return urlPatternsOf(manifest).flatMap((p) => {
    const [path, query = ''] = p.pattern.split('?')
    const word = typeWordOf(p.pattern)
    if (!word || !/<(d|id)>/.test(path) || /<[a-z]+>/.test(query)) return []
    return (p.kind !== undefined ? [p.kind] : handledKinds(manifest)).map((kind) => ({ word, kind, pattern: p.pattern }))
  })
}

/**
 * Where `own` declares a word another manifest declares for a different kind
 * (§7.7 rule 1), one sentence per collision; empty when there is none.
 *
 * The same word for the same kind is fine — that is a second app handling
 * the kind under its owner's word, which is what the rule asks for.
 */
export function wordCollisions(own: Manifest, others: readonly (Manifest & { name?: string })[]): string[] {
  const found: string[] = []
  for (const mine of fileShapesOf(own)) {
    for (const other of others) {
      for (const theirs of fileShapesOf(other)) {
        if (theirs.word !== mine.word || theirs.kind === mine.kind) continue
        found.push(`"${mine.word}" is kind ${mine.kind} here and kind ${theirs.kind} in ${other.name ?? 'another manifest'} (${theirs.pattern})`)
      }
    }
  }
  return [...new Set(found)]
}
