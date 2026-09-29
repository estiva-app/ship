import { Link, ProgressBar } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { linkTo } from '@/router'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { Property } from '@/components/ui/Property'
import { Select, type SelectOption } from '@/components/ui/Select'
import { SkeletonBar } from '@/components/ui/Skeleton'

/**
 * The project page's right rail, exactly as production lays it out, from
 * the shared parts: Status and Assignee as selects (the assignee with a
 * face), Progress as a bar with its words, the Folder it is in by name, and
 * the danger zone below a divider — Archive, and Delete in the destructive
 * colour. Every button small (Katerina, 2026-08-26).
 *
 * **No pairing** (FOL-3). The Folder used to be a raw uuid with "Copy Folder
 * link" and "Pair with another Folder…" beside it, from when a project was
 * paired with a Peek topic. A project is in a top-level Folder now, placed by
 * that Folder's state, so the rail names it and links to its page — and
 * "Move to Folder…" beneath it changes which one lists it (FOL-7).
 *
 * Ship-only: it knows what a project is. The writes behind the controls
 * arrive with REW-5; until then the callbacks are the caller's.
 */
export interface RailPerson {
  value: string
  name: string
  picture?: string
}

/** A top-level Folder as the rail names it. */
export interface RailFolder {
  name: string
  /** Its Folder page. */
  href: string
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
  /**
   * The top-level Folders this project is in (`placedIn`, the sidebar's rule),
   * each by name and linking to its Folder page. Usually one; empty when it is
   * in none; `null` when no Folders could be read; `undefined` while they are
   * still being read.
   */
  folders: RailFolder[] | null | undefined
  /** "Move to Folder…" under the Folder (FOL-7). Offered once the Folders are read; absent, no button. */
  onMove?: () => void
  archived: boolean
  onArchive: () => void
  onDelete: () => void
  /** Why writes are unavailable: disables the selects and the write buttons, as a tooltip. The Folder link stays. */
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
  folders,
  onMove,
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
        {folders === undefined ? (
          // Held back 150ms like the sidebar's placeholder, so a fast read never flashes it.
          <div className="animate-skeleton-in" aria-hidden>
            <SkeletonBar className="h-3.5 w-24" />
          </div>
        ) : folders === null ? (
          <span className="text-text-muted">Folders could not be read</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {folders.length === 0 ? (
              <span className="text-text-muted">—</span>
            ) : (
              folders.map((folder) => (
                <Link key={folder.href} {...linkTo(folder.href)} variant="quiet">
                  {folder.name}
                </Link>
              ))
            )}
            {onMove && (
              <Button size="small" variant="muted" onClick={onMove} disabledReason={readOnlyReason}>
                Move to Folder…
              </Button>
            )}
          </div>
        )}
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
