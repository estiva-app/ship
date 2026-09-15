import { useEffect, useState } from 'react'
import { readFolders } from './foreign'
import type { FolderSummary } from './foreign'

/**
 * The Folders a person navigates by — the teams (SHI-25).
 *
 * `listFolders` answers with every channel this identity can see, and most
 * of production's are nobody's Folder: Ship's own record channels (one
 * `project-…` per project, `Store.ensureFolder`), the channel a project's
 * issues live in by `h`, Peek's test topics. Each is reached through the
 * object it belongs to. What marks a Folder out is the relay's own mark:
 * a `kind:30890` exists once somebody has sent a Folder command at the
 * channel — placed something in it, named it — and a record channel never
 * gets one. A Folder another Folder lists (`listedIn`) is a row in that one.
 *
 * The same predicate Peek draws its Folders column from (`topLevelFolders`
 * in peek#221), so the two apps show the same five. Not the five by id: a
 * sixth team is a Folder somebody creates, not a code change.
 */
export function topLevelFolders(folders: FolderSummary[]): FolderSummary[] {
  return folders.filter((folder) => folder.hasState && !folder.listedIn?.length)
}

/**
 * The Folders this identity can see, for the sidebar.
 *
 * **Read once on mount, not on the workspace poll.** A Folder's name changes
 * about as often as a channel is created, and this is a global query across two
 * kinds — putting it on the tick would spend a request a second of the relay's
 * 300-a-minute budget (SHI-12) to re-learn the same list. The folder *page*
 * re-reads its own contents; the navigation does not need to.
 *
 * A failure is an empty list rather than a thrown error: the sidebar's other
 * sections are unaffected, and a workspace with no folder state yet is
 * indistinguishable from a relay that did not answer — both mean "no folders to
 * show here", and neither is worth a banner over the projects list.
 */
export function useFolders(): FolderSummary[] | undefined {
  // `undefined` until the first read lands, so the sidebar can say a list is
  // coming rather than draw nothing and then a section (Katerina,
  // 2026-09-09); an empty list after, whether the workspace has no Folders
  // or the relay did not answer — the two are still one thing here.
  const [folders, setFolders] = useState<FolderSummary[] | undefined>(undefined)
  useEffect(() => {
    let live = true
    readFolders()
      .then((next) => live && setFolders(next))
      .catch(() => live && setFolders([]))
    return () => {
      live = false
    }
  }, [])
  return folders
}
