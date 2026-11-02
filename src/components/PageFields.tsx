import { LinkPickers, LinkedIcon, ProgressRing, type PickerOption } from '@estiva-app/ui'
import { Select, type SelectOption } from '@/components/ui/Select'

/**
 * An issue's and a project's fields as one row under the summary, where the
 * details column's selects were (ONE-6, step 4b; Katerina, 1 November: as Leaf
 * draws a Ship file). The status and the person are the kit's `LinkPickers`, the
 * pickers a Ship card has everywhere; then an issue's project, or a project's
 * progress. 8px apart, as LinkPickers parts its own two.
 *
 * Shut, they stay where they are and say why on hover and on keyboard focus:
 * archived, the reason names what to unarchive (SHI-36); signed out, why
 * nothing can be written.
 */

/** Someone in the workspace, as the pickers and the Members dialog offer them. */
export interface WorkspacePerson {
  value: string
  name: string
  picture?: string
  /** An agent: its face is a robot (ui 0.97.0). */
  bot?: boolean
}

/** The people as the owner picker's options: nobody first, as "Unassigned", which the kit draws as the silhouette. */
function ownerOptions(people: WorkspacePerson[]): PickerOption[] {
  return [{ value: '', label: 'Unassigned' }, ...people.map((person) => ({ value: person.value, label: person.name, picture: person.picture, ...(person.bot ? { bot: true } : {}) }))]
}

export interface IssueFieldsProps {
  status: string
  /** The vocabulary, each with its colour, so the picker draws its shape. */
  statuses: PickerOption[]
  onStatusChange: (value: string) => void
  /** `''` for unassigned. */
  assignee: string
  people: WorkspacePerson[]
  onAssigneeChange: (value: string) => void
  /** `''` for no project. */
  project: string
  projects: SelectOption[]
  onProjectChange: (value: string) => void
  /** The issue's own archive (FOL-46); archived only with its project, the move out stays open. */
  archived?: boolean
  /** Why nothing can be written: every picker shut, saying it. */
  readOnlyReason?: string
  /** Why its fields are shut while it is archived (SHI-36): unarchiving is the way back. */
  lockedReason?: string
}

/** An issue's status, assignee and project, as one row under its summary. */
export function IssueFields({ status, statuses, onStatusChange, assignee, people, onAssigneeChange, project, projects, onProjectChange, archived = false, readOnlyReason, lockedReason }: IssueFieldsProps) {
  const fieldsShut = readOnlyReason ?? lockedReason
  return (
    <div className="flex min-h-6 flex-wrap items-center gap-2" data-page-fields>
      <LinkPickers
        status={{ value: status, options: statuses, onChange: onStatusChange }}
        owner={{ value: assignee, options: ownerOptions(people), onChange: onAssigneeChange }}
        ownerLabel="Assignee"
        disabledReason={fieldsShut}
      />
      {/* Archived only with its project, a move out stays offered (SPEC §6.5): it is how the issue reopens. */}
      <Select
        size="small"
        fill="wash"
        className="w-auto"
        value={project}
        onChange={onProjectChange}
        ariaLabel="Project"
        disabledReason={archived ? fieldsShut : readOnlyReason}
        // A project's own icon before its name; "No project" names none, so it has none.
        options={projects.map((option) => (option.value ? { ...option, leading: <LinkedIcon kind="project" size={14} /> } : option))}
      />
    </div>
  )
}

export interface ProjectFieldsProps {
  status: string
  statuses: PickerOption[]
  onStatusChange: (value: string) => void
  /** `''` for unassigned. The spec's `lead`; the page says "Assignee", as PEEK-22 does. */
  lead: string
  people: WorkspacePerson[]
  onLeadChange: (value: string) => void
  done: number
  total: number
  readOnlyReason?: string
  lockedReason?: string
}

/** A project's status, assignee and progress, as one row under its summary. */
export function ProjectFields({ status, statuses, onStatusChange, lead, people, onLeadChange, done, total, readOnlyReason, lockedReason }: ProjectFieldsProps) {
  return (
    <div className="flex min-h-6 flex-wrap items-center gap-2" data-page-fields>
      <LinkPickers
        status={{ value: status, options: statuses, onChange: onStatusChange }}
        owner={{ value: lead, options: ownerOptions(people), onChange: onLeadChange }}
        ownerLabel="Assignee"
        disabledReason={readOnlyReason ?? lockedReason}
      />
      {/* The kit's ring says "2/9" itself, as on a card, and "2 of 9 done" on hover: its own tooltip, no second one. */}
      <span className="inline-flex h-6 items-center px-1">
        <ProgressRing done={done} total={total} />
      </span>
    </div>
  )
}
