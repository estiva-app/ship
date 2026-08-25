import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { Person } from '@/components/ui/Person'
import { Property } from '@/components/ui/Property'
import { Select, type SelectOption } from '@/components/ui/Select'
import { peopleOptions, type RailPerson } from './ProjectRail'

/**
 * The issue page's right rail, as production: Status, Assignee (with a
 * face) and Project as selects; then who opened it and when; then the one
 * action Peek needs, "Copy reference for Peek". Every button small.
 *
 * Ship-only: it knows what an issue is. Writes arrive with REW-5.
 */
export interface IssueRailProps {
  status: string
  statuses: SelectOption[]
  onStatusChange: (value: string) => void
  /** `''` for unassigned. */
  assignee: string
  people: RailPerson[]
  onAssigneeChange: (value: string) => void
  /** `''` for "Inbox (no project)". */
  project: string
  projects: SelectOption[]
  onProjectChange: (value: string) => void
  openedBy: { name?: string; picture?: string }
  /** Seconds, as the relay keeps them. */
  openedAt: number
  onCopyReference: () => void
  className?: string
}

export function IssueRail({
  status,
  statuses,
  onStatusChange,
  assignee,
  people,
  onAssigneeChange,
  project,
  projects,
  onProjectChange,
  openedBy,
  openedAt,
  onCopyReference,
  className,
}: IssueRailProps) {
  return (
    <aside className={cn('flex w-[250px] shrink-0 flex-col gap-4', className)}>
      <Property layout="stacked" label="Status">
        <Select value={status} onChange={onStatusChange} options={statuses} ariaLabel="Status" />
      </Property>
      <Property layout="stacked" label="Assignee">
        <Select value={assignee} onChange={onAssigneeChange} options={peopleOptions(people)} ariaLabel="Assignee" />
      </Property>
      <Property layout="stacked" label="Project">
        <Select value={project} onChange={onProjectChange} options={projects} ariaLabel="Project" />
      </Property>
      <Divider className="mx-0" />
      <span className="flex items-center gap-1.5 text-caption text-text-muted">
        Opened by
        <Person name={openedBy.name} picture={openedBy.picture} size={16} className="text-text-secondary" />
        · {ago(openedAt)}
      </span>
      <Button size="small" variant="outlined" className="self-start" onClick={onCopyReference}>
        Copy reference for Peek
      </Button>
    </aside>
  )
}
