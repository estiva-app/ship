import { cn } from '@/lib/cn'
import { ago } from '@/lib/time'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { Person } from '@/components/ui/Person'
import { Property } from '@/components/ui/Property'
import { Select, type SelectOption } from '@/components/ui/Select'
import { WhyLocked, peopleOptions, type RailPerson } from './ProjectRail'

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
  /** `''` for no project. */
  project: string
  projects: SelectOption[]
  onProjectChange: (value: string) => void
  openedBy: { name?: string; picture?: string }
  /** Seconds, as the relay keeps them. */
  openedAt: number
  onCopyReference: () => void
  onDelete: () => void
  /** Why writes are unavailable: disables the three selects and says why on hover. Copy stays. */
  readOnlyReason?: string
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
  onDelete,
  readOnlyReason,
  className,
}: IssueRailProps) {
  const locked = !!readOnlyReason
  return (
    <aside className={cn('flex w-[250px] shrink-0 flex-col gap-4', className)}>
      {/* A locked select says why on hover, as Delete does (WhyLocked). */}
      <Property layout="stacked" label="Status">
        <WhyLocked reason={readOnlyReason}>
          <Select value={status} onChange={onStatusChange} options={statuses} ariaLabel="Status" disabled={locked} />
        </WhyLocked>
      </Property>
      <Property layout="stacked" label="Assignee">
        <WhyLocked reason={readOnlyReason}>
          <Select value={assignee} onChange={onAssigneeChange} options={peopleOptions(people)} ariaLabel="Assignee" disabled={locked} />
        </WhyLocked>
      </Property>
      <Property layout="stacked" label="Project">
        <WhyLocked reason={readOnlyReason}>
          <Select value={project} onChange={onProjectChange} options={projects} ariaLabel="Project" disabled={locked} />
        </WhyLocked>
      </Property>
      <Divider className="mx-0" />
      {/* The same shape as the three above (Katerina, 2026-09-08): the label
          over the value, not beside it. */}
      <Property layout="stacked" label="Opened by">
        <span className="flex items-center gap-1.5 text-caption text-text-muted">
          {/* A name takes the tone of where it sits (UIG-9). */}
          <span className="contents text-text-secondary">
            <Person name={openedBy.name} picture={openedBy.picture} size={16} />
          </span>
          · {ago(openedAt)}
        </span>
      </Property>
      <Button size="small" variant="outlined" className="self-start" onClick={onCopyReference}>
        Copy reference for Peek
      </Button>
      <Divider className="mx-0" />
      <Button size="small" variant="destructive" className="self-start" onClick={onDelete} disabledReason={readOnlyReason}>
        Delete issue
      </Button>
    </aside>
  )
}
