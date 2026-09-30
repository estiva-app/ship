import { IconArchive } from '@tabler/icons-react'
import { Banner } from '@/components/Banner'
import type { ArchiveState } from '@/lib/archive'
import { ago } from '@/lib/time'

/** The first thing an archived project, issue or Folder shows: who archived it, the resolution, and Unarchive (FOL-46). */
export interface ArchivedNoticeProps {
  archive: ArchiveState
  nameOf: (pubkey: string) => string
  /** Restore it. Omitted when it is archived only `with` a parent, which is where it is restored. */
  onUnarchive?: () => void
  /** Open the parent it is archived with. */
  onOpenParent?: () => void
  /** Why writes are unavailable; the Unarchive action is left out with it. */
  readOnlyReason?: string
}

export function ArchivedNotice({ archive, nameOf, onUnarchive, onOpenParent, readOnlyReason }: ArchivedNoticeProps) {
  const line = archive.with
    ? `Archived with its ${archive.with.kind} “${archive.with.title}” by ${nameOf(archive.by)}, ${ago(archive.at)}`
    : `Archived by ${nameOf(archive.by)}, ${ago(archive.at)}`
  const action = archive.with
    ? onOpenParent && { label: `Open ${archive.with.kind}`, onClick: onOpenParent }
    : onUnarchive && !readOnlyReason && { label: 'Unarchive', onClick: onUnarchive }
  return (
    <div className="flex flex-col gap-2">
      <Banner tone="info" icon={<IconArchive size={16} stroke={1.5} />} {...(action ? { action } : {})}>
        {line}
      </Banner>
      {archive.resolution && <p className="whitespace-pre-wrap text-body-2 text-text-primary">{archive.resolution}</p>}
    </div>
  )
}
