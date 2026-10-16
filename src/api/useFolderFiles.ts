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

/**
 * The last list for each Folder, and the read in flight, for the tab — by the
 * Folder's address (`kind:pubkey:d`), never the reference a card was written
 * with: an `naddr` may carry relay hints, and the same Folder linked twice must
 * still be one read.
 */
const held = new Map<string, { at: number; files: Files }>()
const reading = new Map<string, Promise<Files>>()

/** Whether a resolved object is a Folder this reader can read, so a card for it lists its files. */
export function isReadableFolder(object: ForeignObject): boolean {
  return object.kind === KIND_CHANNEL_METADATA && !object.unreachable
}

/**
 * The files a Folder's card lists, read once per answer for every card that
 * asks.
 *
 * Only a list, or an end of access, replaces what is held. interop answers a
 * listing it could not read with no `children` at all (`folderFilesOf` catches
 * every error), exactly as it answers a Folder with no listing: so an answer
 * with no list keeps the list already on screen and is not held as fresh, and
 * a throw is the same. An `unreachable` Folder — access ended — clears it.
 */
function readFolderFiles(address: string, reference: string): Promise<Files> {
  const last = held.get(address)
  if (last && Date.now() - last.at < FOLDER_FILES_FRESH_MS) return Promise.resolve(last.files)
  const inFlight = reading.get(address)
  if (inFlight) return inFlight
  const kept = () => held.get(address)?.files
  const read = resolveForeign(reference, { folderFiles: true })
    .then(
      (object) => {
        if (object?.unreachable) {
          held.set(address, { at: Date.now(), files: undefined })
          return undefined
        }
        if (!object?.children) return kept()
        held.set(address, { at: Date.now(), files: object.children })
        return object.children
      },
      kept,
    )
    .finally(() => reading.delete(address))
  reading.set(address, read)
  return read
}

/**
 * A linked Folder drawn as a card, with the files it holds that this reader
 * can open, in the Folder's order (SPEC §3.2; Miky, 2026-10-16). Only for an
 * object `isReadableFolder` says is one: it subscribes to focus, and no other
 * card should re-render when the window does.
 *
 * **Its own read, never the refresh tick.** `useForeignObjects` resolves every
 * chip and card on the page every ten seconds, and the files cost what a
 * Folder's page costs (Estiva HQ: 7.6 MB, ~2 s warm) — where its chip, which
 * lists nothing, is one small request. So the files are read when the card is
 * drawn and when the window comes back into focus, and nowhere else.
 *
 * The card draws at once from `object`, the resolve every chip shares, and the
 * list fills in when its read arrives.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/folders-belong-to-the-protocol.md
 */
export function useFolderFiles(reference: string, object: ForeignObject): ForeignObject {
  const address = object.ref
  const [answer, setAnswer] = useState<{ address: string; files: Files } | undefined>(() => {
    const last = held.get(address)
    return last ? { address, files: last.files } : undefined
  })
  const [focusNonce, setFocusNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    void readFolderFiles(address, reference).then((files) => {
      if (!cancelled) setAnswer({ address, files })
    })
    return () => {
      cancelled = true
    }
    // The reference is only how to ask; the address is which Folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, focusNonce])

  // Focus and a tab coming back only: the timer is the refresh tick this read must stay off.
  useRefresh(() => setFocusNonce((n) => n + 1), { interval: false })

  const files = answer?.address === address ? answer.files : undefined
  return files ? { ...object, children: files } : object
}
