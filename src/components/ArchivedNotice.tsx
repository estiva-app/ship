import { IconArchive } from '@tabler/icons-react'
import { Button, Card } from '@estiva-app/ui'
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

/**
 * A quiet grey box, not a blue banner (Katerina, 30 September, option C):
 * archived is a state the file is in, not news. The Banner is the app-wide
 * strip under the header, square and one line; this sits in the page, so it
 * is a card with the reason inside it rather than loose under it.
 */
export function ArchivedNotice({ archive, nameOf, onUnarchive, onOpenParent, readOnlyReason }: ArchivedNoticeProps) {
  const line = archive.with
    ? `Archived with its ${archive.with.kind} “${archive.with.title}” by ${nameOf(archive.by)}, ${ago(archive.at)}`
    : `Archived by ${nameOf(archive.by)}, ${ago(archive.at)}`
  const action = archive.with
    ? onOpenParent && { label: `Open ${archive.with.kind}`, onClick: onOpenParent }
    : onUnarchive && !readOnlyReason && { label: 'Unarchive', onClick: onUnarchive }
  return (
    <Card fill="surface" className="flex items-start gap-3 px-4 py-3">
      <IconArchive size={16} stroke={1.5} className="mt-0.5 shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body-2-strong text-text-primary">{line}</span>
        {archive.resolution && <p className="whitespace-pre-wrap text-body-2 text-text-secondary">{archive.resolution}</p>}
      </div>
      {action && (
        <Button variant="outlined" size="small" className="shrink-0" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Card>
  )
}
