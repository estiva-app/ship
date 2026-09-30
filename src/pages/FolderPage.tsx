import { useCallback, useEffect, useRef, useState } from 'react'
import { archiveFolder, renameFolder } from '@/api'
import { folderArchiveImpact, readFolder, type FolderContents, type FolderSummary } from '@/api/foreign'
import { ArchiveDialog } from '@/components/ArchiveDialog'
import { ArchivedNotice } from '@/components/ArchivedNotice'
import { reloadFolders } from '@/api/useFolders'
import { SkeletonList } from '@/components/ui/Skeleton'
import { FolderView } from '@/views/FolderView'
import { act, type Say } from '@/pages/act'

/**
 * The Folder page: the read, and the three states around it.
 *
 * Wiring only — `FolderView` draws it. The split is the house rule (a view is
 * reviewable in Storybook, a fetch is not), and it earns its keep here for a
 * second reason: a Folder's contents are **not Ship's fold**. Every other page
 * in this app is handed `FolderState` and renders it; this one reads through
 * the projection layer, because the files belong to apps whose records Ship
 * neither stores nor understands.
 *
 * Read on mount and on `id`, not on the workspace poll. A Folder's contents
 * change when somebody moves a file, which is rare, and this costs a handful of
 * requests against a relay that meters reads at 300 a minute (SHI-12).
 *
 * **Renamed from its title** (FOL-8). `hasState` comes from this page's own
 * read, which is the one the planner needs: a command against a Folder with no
 * state would empty it. Afterwards this Folder and the sidebar's listing are
 * read again, so the name on screen is the one the relay now holds.
 */
export function FolderPage({ id, folders, nameOf = (pubkey) => `${pubkey.slice(0, 8)}…`, say }: {
  id: string
  /** The sidebar's listing, so the archive warning can name where a file stays visible (FOL-46). */
  folders?: FolderSummary[]
  /** The archiver's name; a Folder page does not wait for the workspace's directory. */
  nameOf?: (pubkey: string) => string
  say: Say
}) {
  const [contents, setContents] = useState<FolderContents | null>(null)
  const [failed, setFailed] = useState(false)
  const [archiving, setArchiving] = useState<{ hides: string[]; staysVisible: string[] } | null>(null)
  // The Folder on screen now, so a rename's re-read that lands after navigating away is dropped.
  const shown = useRef(id)

  useEffect(() => {
    shown.current = id
    let live = true
    setContents(null)
    setFailed(false)
    void (async () => {
      try {
        const next = await readFolder(id)
        if (live) setContents(next)
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [id])

  const rename = useCallback(
    async (name: string) => {
      if (!contents) return false
      if (!name) {
        say('A folder needs a name.', 'error')
        return false
      }
      /*
        `hasState` read again now, not taken from when the page opened: another
        app may have listed something here since, and a rename that believed
        there was no state would write only the channel's name, which the
        state's shadows. A failed read falls back to the page's: short of
        deleting the Folder nothing takes state away, so an old `true` is
        still true, and an old `false` only risks the lesser failure above.
      */
      const hasState = await readFolder(contents.id).then((fresh) => fresh.hasState, () => contents.hasState)
      return act('Rename', () => renameFolder({ id: contents.id, hasState }, name), say, async () => {
        const [next] = await Promise.allSettled([readFolder(contents.id), reloadFolders()])
        if (next.status === 'fulfilled') {
          if (next.value.id === shown.current) setContents(next.value)
        } else {
          // Accepted, and not read back: without this the title would show the old name as though nothing happened.
          say(`Renamed to ${name}, but the folder could not be read back — reload to see it.`, 'error')
        }
      })
    },
    [contents, say],
  )

  /*
    Archive (FOL-46): a change on the Folder's own address, so what it holds is
    untouched and comes back with it. The warning is a read — what only this
    Folder lists, and what stays visible elsewhere — made when the person asks,
    not on every page load.
  */
  const reread = useCallback(async () => {
    const [next] = await Promise.allSettled([readFolder(id), reloadFolders()])
    if (next.status === 'fulfilled' && next.value.id === shown.current) setContents(next.value)
  }, [id])
  const askToArchive = useCallback(async () => {
    if (!contents?.channel) return
    try {
      setArchiving(await folderArchiveImpact(contents.channel, folders))
    } catch (error) {
      say(`Could not count what archiving would hide — ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [contents, folders, say])
  const setArchived = useCallback(
    async (archived: boolean, resolution?: string) => {
      if (!contents?.channel) return false
      const ok = await act(archived ? 'Archive' : 'Unarchive', () => archiveFolder({ id: contents.id, channel: contents.channel! }, archived, resolution), say, reread)
      if (ok) say(archived ? 'Folder archived' : 'Folder restored')
      return ok
    },
    [contents, say, reread],
  )

  if (failed) {
    return (
      <div className="p-6 text-body-2 text-text-muted" data-folder-error={id}>
        This folder could not be read.
      </div>
    )
  }

  if (!contents) {
    return (
      <div className="flex flex-col gap-3 p-6" data-loading="folder">
        <SkeletonList rows={4} />
      </div>
    )
  }

  return (
    <>
      <FolderView
        folder={contents}
        onRename={rename}
        {...(contents.channel && !contents.archived ? { onArchive: () => void askToArchive() } : {})}
        archivedNotice={
          contents.archived && (
            <ArchivedNotice
              archive={{ by: contents.archived.by, at: contents.archived.at, resolution: contents.archived.resolution }}
              nameOf={nameOf}
              onUnarchive={() => void setArchived(false)}
            />
          )
        }
      />
      {archiving && (
        <ArchiveDialog
          title={contents.name ?? 'Untitled folder'}
          what="folder"
          hides={archiving.hides.map((part) => `${part} only in it`)}
          staysVisible={archiving.staysVisible}
          onClose={() => setArchiving(null)}
          onArchive={(resolution) => setArchived(true, resolution || undefined)}
        />
      )}
    </>
  )
}
