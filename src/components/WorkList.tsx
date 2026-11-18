import { KindIcon, ListTable, ListTableRow, type ListTableColumn } from '@estiva-app/ui'
import { ProjectProgress } from '@/components/ProjectProgress'
import { Avatar } from '@/components/ui/Avatar'
import { StatusLabel } from '@/components/ui/StatusLabel'

/**
 * One of Ship's own files in a {@link WorkList}: a project or an issue. Its facts are optional; with any, the list shows
 * the ones Ship's own lists show.
 */
export interface WorkListRow {
  address: string
  title: string
  href: string
  /** Under the name, one line: an issue's project on an initiative's page, as its row there named it. */
  description?: string
  status?: { value: string; label: string }
  /** A project's lead, an issue's assignee. */
  person?: { name?: string; picture?: string; bot?: boolean }
  /** A project's issues done of all. */
  progress?: { done: number; total: number }
  /** An issue's last change, in the page's words: "3h ago", "Ana, 1h ago". */
  updated?: string
}

/** A project's facts, as the Projects list shows them; status and lead give way first in a narrow window. */
const PROJECT_COLUMNS: ListTableColumn[] = [
  { label: 'Status', width: 'medium', keep: 'low' },
  { label: 'Lead', width: 'small', keep: 'low' },
  { label: 'Progress', width: 'large' },
]

/** An issue's facts, as the Issues list shows them, in a project's widths, so the two lists' columns line up. */
const ISSUE_COLUMNS: ListTableColumn[] = [
  { label: 'Status', width: 'medium', keep: 'low' },
  { label: 'Assignee', width: 'small', keep: 'low' },
  { label: 'Updated', width: 'large' },
]

/**
 * Ship's own files of one kind in the kit's list, as a team's page and an initiative's page list them (Katerina, 18
 * November, D6 and A4): each row its kind's icon and name; with any facts, a project's status, lead and progress (the
 * Projects list) or an issue's status, assignee and last change (the Issues list). No headings on screen: the heading
 * over the list names it.
 */
export function WorkList({ label, kind, rows }: { label: string; kind: 'project' | 'issue'; rows: WorkListRow[] }) {
  const facts = rows.some((row) => row.status || row.person || row.progress || row.updated)
  // As `ProjectRow` draws a lead: a person with no name read yet is the kit's face for nobody named, not a letter.
  const face = (row: WorkListRow) => row.person && <Avatar name={row.person.name} src={row.person.picture} bot={row.person.bot} size={16} label={row.person.name} />
  const status = (row: WorkListRow) => row.status && <StatusLabel value={row.status.value} label={row.status.label} size="small" />
  const cellsOf = (row: WorkListRow) =>
    !facts ? [] : kind === 'project' ? [status(row), face(row), row.progress && <ProjectProgress {...row.progress} wide />] : [status(row), face(row), row.updated]
  return (
    <ListTable aria-label={label} columns={facts ? (kind === 'project' ? PROJECT_COLUMNS : ISSUE_COLUMNS) : []} headings={false}>
      {rows.map((row) => (
        <ListTableRow
          key={row.address}
          data-work={row.address}
          data-work-kind={kind}
          href={row.href}
          label={row.title}
          {...(row.description ? { description: row.description } : {})}
          icon={<KindIcon kind={kind} />}
          cells={cellsOf(row)}
        />
      ))}
    </ListTable>
  )
}
