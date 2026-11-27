import { useEffect, useSyncExternalStore } from 'react'
import { fileUrlOf, type FileLinkWords } from '@estiva-app/interop'
import { linkWordsOf } from '@/lib/fileLinks'
import { declaredManifests } from './handoff'

/**
 * The words Ship hands a file's link out with (LIN-4), read once off the
 * manifests the hand-off already reads (`declaredManifests`, one shared
 * `kind:31990` query), so no read is added. Before they are read, or when the
 * read fails, a link is the file's `/o/<naddr>`: every app opens it.
 */
const NONE: FileLinkWords = { byKind: {} }
/** The words once a read has answered; null until then. A failed read answers with none. */
let words: FileLinkWords | null = null
let loading: Promise<FileLinkWords> | null = null
const listeners = new Set<() => void>()

function settle(next: FileLinkWords): FileLinkWords {
  words = next
  for (const listener of listeners) listener()
  return next
}

/** Read the words, once; a failed read is forgotten so the next link asks again. */
export function loadLinkWords(): Promise<FileLinkWords> {
  loading ??= declaredManifests().then(
    (manifests) => settle(linkWordsOf(manifests)),
    () => {
      loading = null
      return settle(words ?? NONE)
    },
  )
  return loading
}

/**
 * The words for a link drawn in render: null until the first read answers, so a
 * page that sends the reader on can wait for the short link. Asks for them.
 */
export function useLinkWords(): FileLinkWords | null {
  useEffect(() => void loadLinkWords(), [])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => words,
  )
}

/**
 * The link Copy link hands out for a file: `<origin>/<word>/<slug>-<d>`, the
 * same on every app's host, or null for a `d` no file can have.
 */
export async function fileUrl(address: string, title?: string, origin = window.location.origin): Promise<string | null> {
  return fileUrlOf(address, await loadLinkWords(), origin, title)
}
