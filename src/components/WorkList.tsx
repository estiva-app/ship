import { KindIcon, ListTable, ListTableRow, MembersPill, ProgressRing, type AvatarGroupMember, type ListTableColumn } from '@estiva-app/ui'
import { Avatar } from '@/components/ui/Avatar'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { formatActive } from '@/lib/time'

/** What a row is: an initiative (`topic`, the code's word), a project or an issue — its kind's icon, and which facts it has. */
export type WorkKind = 'topic' | 'project' | 'issue'

/**
 * One row of a {@link WorkList}. Each fact sits in the same column whatever the kind; one a kind does not have is
 * left empty, and one not read yet is the kit's dash.
 */
export interface WorkListRow {
  address: string
  title: string
  href: string
  /** Under the name, one line: an initiative's summary, an issue's project on an initiative's page. */
  description?: string
  /** A project's or an issue's status. */
  status?: { value: string; label: string }
  /** A project's lead, an issue's assignee: one face. */
  person?: { name?: string; picture?: string; bot?: boolean }
  /** An initiative's people: up to three faces and how many; `undefined` until read. */
  members?: { faces: AvatarGroupMember[]; count: number }
  /** A project's issues done of all. */
  progress?: { done: number; total: number }
  /** Unix seconds: when anything last happened in it — an initiative's Active, a project's or an issue's last change. */
  at?: number
}

/**
 * ONE column set for every list on a team's page and an initiative's page, so like facts stack in one column down the
 * whole page (Katerina, 18 November: "relevant items are aligned on initiatives/projects/issues"): its status, its
 * people, its progress, and when it last moved. Who and when give way first in a narrow window.
 */
const COLUMNS: ListTableColumn[] = [
  { label: 'Status', width: 'medium' },
  { label: 'People', width: 'large', keep: 'low' },
  { label: 'Progress', width: 'small' },
  { label: 'When', width: 'medium', keep: 'low' },
]

/**
 * Nothing: a fact this kind does not have. The kit's row draws its dash only for a cell that is absent ("not read
 * yet"), so an empty string is an empty cell.
 */
const NONE = ''

/**
 * Ship's lists on a team's page and an initiative's page (Katerina, 18 November, D6 and A4): the kit's list, each row its
 * kind's icon and name, then the same four columns for every kind — **Status** (a project's, an issue's), **People** (an
 * initiative's faces in the kit's members pill, a project's lead, an issue's assignee), **Progress** (a project's, as the
 * kit's small ring: "the progress bar can also be using the small progress which is a circle") and **When** (an
 * initiative's Active, a project's or an issue's last change, in Peek's words). A fact a kind does not have is left
 * empty, so every list's columns line up. No headings on screen: the heading over the list names it.
 */
export function WorkList({ label, kind, rows, now = Date.now() }: { label: string; kind: WorkKind; rows: WorkListRow[]; now?: number }) {
  const status = (row: WorkListRow) => (kind === 'topic' ? NONE : row.status ? <StatusLabel value={row.status.value} label={row.status.label} size="small" /> : NONE)
  const people = (row: WorkListRow) => {
    if (kind === 'topic') return row.members === undefined ? undefined : row.members.count === 0 ? '0' : <MembersPill readOnly members={row.members.faces.slice(0, 3)} count={row.members.count} />
    // As `ProjectRow` draws a lead: a person with no name read yet is the kit's face for nobody named, not a letter.
    return row.person ? <Avatar name={row.person.name} src={row.person.picture} bot={row.person.bot} size={16} label={row.person.name} /> : NONE
  }
  const progress = (row: WorkListRow) => (kind === 'project' && row.progress ? <ProgressRing done={row.progress.done} total={row.progress.total} /> : NONE)
  // An initiative's Active not read yet is the dash, as Explore's; for a project or an issue no time is nothing to say.
  const when = (row: WorkListRow) => (row.at ? formatActive(row.at * 1000, now) : kind === 'topic' ? undefined : NONE)
  return (
    <ListTable aria-label={label} columns={COLUMNS} headings={false}>
      {rows.map((row) => (
        <ListTableRow
          key={row.address}
          data-work={row.address}
          data-work-kind={kind}
          href={row.href}
          label={row.title}
          {...(row.description ? { description: row.description } : {})}
          icon={<KindIcon kind={kind} />}
          cells={[status(row), people(row), progress(row), when(row)]}
        />
      ))}
    </ListTable>
  )
}
