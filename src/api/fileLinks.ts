import { fileUrlOf, type FileLinkWords } from '@estiva-app/interop'
import { linkWordsOf } from '@/lib/fileLinks'
import { declaredManifests, forgetDeclaredManifestsForTests } from './handoff'

/**
 * The words Ship hands a file's link out with (LIN-4), read once off the
 * manifests the hand-off already reads (`declaredManifests`, one shared
 * `kind:31990` query), so no read is added. Before they are read, or when the
 * read fails, a link is the file's `/o/<naddr>`: every app opens it.
 */
const NONE: FileLinkWords = { byKind: {} }
/** The words once a read has answered with manifests; null until then, and after a failed or empty read. */
let words: FileLinkWords | null = null
let loading: Promise<FileLinkWords> | null = null

/**
 * Read the words, once. A failed read, or an empty one (a relay always holds
 * Ship's own manifest, so none means it did not really answer, as
 * `declaredManifests` reads it), is forgotten, so the next link asks again.
 */
export function loadLinkWords(): Promise<FileLinkWords> {
  loading ??= declaredManifests().then(
    (manifests) => {
      if (manifests.length > 0) return (words = linkWordsOf(manifests))
      loading = null
      return NONE
    },
    () => {
      loading = null
      return NONE
    },
  )
  return loading
}

/** The words held now, or null before a read has answered: Copy link writes at once when they are held. */
export function heldLinkWords(): FileLinkWords | null {
  return words
}

/** Forget the words and the manifests they came from, for a test that starts from a relay of its own. */
export function forgetLinkWordsForTests(): void {
  words = null
  loading = null
  forgetDeclaredManifestsForTests()
}

/**
 * The link Copy link hands out for a file: `<origin>/<word>/<slug>-<d>`, the
 * same on every app's host, or null for a `d` no file can have.
 */
export async function fileUrl(address: string, title?: string, origin = window.location.origin): Promise<string | null> {
  return fileUrlOf(address, words ?? (await loadLinkWords()), origin, title)
}
