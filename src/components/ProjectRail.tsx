import { ProgressBar } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { Property } from '@/components/ui/Property'
import { Select, type SelectOption } from '@/components/ui/Select'

/**
 * The project page's right rail, exactly as production lays it out, from
 * the shared parts: Status and Assignee as selects (the assignee with a
 * face), Progress as a bar with its words, the Folder as its id with the two
 * actions, and the danger zone below a divider — Archive, and Delete in the
 * destructive colour. Every button small (Katerina, 2026-08-26).
 *
 * Ship-only: it knows what a project is. The writes behind the controls
 * arrive with REW-5; until then the callbacks are the caller's.
 */
export interface RailPerson {
  value: string
  name: string
  picture?: string
}

export interface ProjectRailProps {
  status: string
  statuses: SelectOption[]
  onStatusChange: (value: string) => void
  /** `''` for unassigned. */
  lead: string
  people: RailPerson[]
  onLeadChange: (value: string) => void
  done: number
  total: number
  /** The Folder this project's work lives in — its uuid, shown as is. */
  folder: string
  onCopyFolderLink: () => void
  onPairFolder: () => void
  archived: boolean
  onArchive: () => void
  onDelete: () => void
  /** Why writes are unavailable: disables the selects and the write buttons, as a tooltip. Copy stays. */
  readOnlyReason?: string
  className?: string
}

/** People as select options, each with a face; unassigned with none. */
export function peopleOptions(people: RailPerson[]): SelectOption[] {
  return [
    { value: '', label: 'Unassigned' },
    ...people.map((person) => ({
      value: person.value,
      label: person.name,
      leading: <Avatar name={person.name} src={person.picture} size={16} />,
    })),
  ]
}

export function ProjectRail({
  status,
  statuses,
  onStatusChange,
  lead,
  people,
  onLeadChange,
  done,
  total,
  folder,
  onCopyFolderLink,
  onPairFolder,
  archived,
  onArchive,
  onDelete,
  readOnlyReason,
  className,
}: ProjectRailProps) {
  return (
    <aside className={cn('flex w-[250px] shrink-0 flex-col gap-4', className)}>
      {/* A locked select says why, as the buttons below do (UIG-14): held shut, reachable by Tab, the reason as its tooltip. */}
      <Property layout="stacked" label="Status">
        <Select value={status} onChange={onStatusChange} options={statuses} ariaLabel="Status" disabledReason={readOnlyReason} />
      </Property>
      <Property layout="stacked" label="Assignee">
        <Select value={lead} onChange={onLeadChange} options={peopleOptions(people)} ariaLabel="Assignee" disabledReason={readOnlyReason} />
      </Property>
      <Property layout="stacked" label="Progress">
        <div className="flex flex-col gap-2">
          <ProgressBar value={done} max={total} label="Issues done" />
          <span className="text-caption tabular-nums text-text-muted">
            {done} of {total} done
          </span>
        </div>
      </Property>
      <Property layout="stacked" label="Folder">
        <div className="flex flex-col items-start gap-2">
          <span className="break-all font-mono text-caption text-text-muted">{folder}</span>
          <Button size="small" variant="outlined" onClick={onCopyFolderLink}>
            Copy Folder link
          </Button>
          <Button size="small" variant="outlined" onClick={onPairFolder} disabledReason={readOnlyReason}>
            Pair with another Folder…
          </Button>
        </div>
      </Property>
      <Divider className="mx-0" />
      <div className="flex flex-col items-start gap-1">
        <Button size="small" variant="muted" onClick={onArchive} disabledReason={readOnlyReason}>
          {archived ? 'Unarchive project' : 'Archive project'}
        </Button>
        <Button size="small" variant="destructive" onClick={onDelete} disabledReason={readOnlyReason}>
          Delete project
        </Button>
      </div>
    </aside>
  )
}
