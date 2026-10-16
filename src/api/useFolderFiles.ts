import { useEffect, useState } from 'react'
import { KIND_CHANNEL_METADATA } from '@estiva-app/interop'
import { resolveForeign, type ForeignObject } from '@/api/foreign'
import { useRefresh } from '@/lib/useRefresh'

type Files = ForeignObject['children']

/**
 * How long an answer stands in for a new read: a second card for the same
 * Folder on the page, or one drawn again, takes it rather than reading again.
 */
export const FOLDER_FILES_FRESH_MS = 30_000

/** The last answer for each Folder, and the read in flight, for the tab. */
const held = new Map<string, { at: number; files: Files }>()
const reading = new Map<string, Promise<Files>>()

/**
 * The files a Folder's card lists, read once per answer for every card that
 * asks. A read that fails keeps the last answer, or none, so the card draws no
 * list rather than an empty one.
 */
function readFolderFiles(reference: string): Promise<Files> {
  const last = held.get(reference)
  if (last && Date.now() - last.at < FOLDER_FILES_FRESH_MS) return Promise.resolve(last.files)
  const inFlight = reading.get(reference)
  if (inFlight) return inFlight
  const read = resolveForeign(reference, { folderFiles: true })
    .then((object) => (object && !object.unreachable ? object.children : undefined))
    .then(
      (files) => {
        held.set(reference, { at: Date.now(), files })
        return files
      },
      () => held.get(reference)?.files,
    )
    .finally(() => reading.delete(reference))
  reading.set(reference, read)
  return read
}

/**
 * A linked Folder drawn as a card or a row, with the files it holds that this
 * reader can open, in the Folder's order (SPEC §3.2; Miky, 2026-10-16).
 *
 * **Its own read, never the refresh tick.** `useForeignObjects` resolves every
 * chip and card on the page every ten seconds, and the files cost what a
 * Folder's page costs (Estiva HQ: 7.6 MB, ~2 s warm) — where its chip, which
 * lists nothing, is one small request. So the files are read when the card is
 * drawn and when the window comes back into focus, and nowhere else.
 *
 * The card draws at once from `object`, the resolve every chip shares, and the
 * list fills in when its read arrives. Anything that is not a readable Folder
 * passes through untouched.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/folders-belong-to-the-protocol.md
 */
export function useFolderFiles(reference: string, object: ForeignObject): ForeignObject {
  const folder = object.kind === KIND_CHANNEL_METADATA && !object.unreachable
  const [answer, setAnswer] = useState<{ reference: string; files: Files } | undefined>(() => {
    const last = held.get(reference)
    return last ? { reference, files: last.files } : undefined
  })
  const [focusNonce, setFocusNonce] = useState(0)

  useEffect(() => {
    if (!folder) return undefined
    let cancelled = false
    void readFolderFiles(reference).then((files) => {
      if (!cancelled) setAnswer({ reference, files })
    })
    return () => {
      cancelled = true
    }
  }, [reference, folder, focusNonce])

  // Focus and a tab coming back only: the timer is the refresh tick this read must stay off.
  useRefresh(() => setFocusNonce((n) => n + 1), { interval: false })

  const files = answer?.reference === reference ? answer.files : undefined
  return folder && files ? { ...object, children: files } : object
}
