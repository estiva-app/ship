import { useEffect, useState } from 'react'
import { readFolder, type FolderContents } from '@/api/foreign'
import { SkeletonList } from '@/components/ui/Skeleton'
import { FolderView } from '@/views/FolderView'

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
 */
export function FolderPage({ id }: { id: string }) {
  const [contents, setContents] = useState<FolderContents | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
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

  return <FolderView folder={contents} />
}
