import type { ReactNode } from 'react'
import { IconDotsVertical, IconUsers } from '@tabler/icons-react'
import { KindIcon, ListTable, ListTableRow, Menu, MenuItem, MembersPill, PageHeader, SectionHeader, Toolbar, ToolbarButton, type AvatarGroupMember, type ListTableColumn } from '@estiva-app/ui'
import { ProjectProgress } from '@/components/ProjectProgress'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SkeletonList } from '@/components/ui/Skeleton'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { ago, formatActive } from '@/lib/time'

/** One initiative the team holds, as Explore lists it: its name and line, who is in it, when it was last active. */
export interface TeamInitiativeRow {
  address: string
  title: string
  summary?: string
  href: string
  /** How many it lists; `undefined` until read. */
  members?: number
  /** Who it lists, by key, in the listing's order: the first three are the pill's faces. */
  people?: string[]
  /** Unix seconds; `undefined` until read. */
  active?: number
}

/**
 * One of Ship's own files the team holds: a project or an issue. Its facts are optional: with any, the list shows the
 * ones Ship's own lists show — a project's status, lead and progress (the Projects list), an issue's status, assignee
 * and last change (the Issues list).
 */
export interface TeamFileRow {
  address: string
  title: string
  href: string
  status?: { value: string; label: string }
  /** A project's lead, an issue's assignee. */
  person?: { name: string; picture?: string; bot?: boolean }
  /** A project's issues done of all. */
  progress?: { done: number; total: number }
  /** An issue's last change, unix seconds. */
  at?: number
}

/**
 * **A team's page in Ship, drawn as Peek's** (Katerina, 18 November, D6: "show me the before and after"): the kit's
 * `PageHeader` with the team's icon, its name, who is in it and its ⋮ (Rename… and Archive team… for its owners and
 * admins); then the kit's lists, one per kind, each under a heading with its count — its **Initiatives** as Explore lists
 * them, its **Projects**, and **Issues** filed in it directly. Ship lists its own kinds and the initiatives it shows
 * everywhere; another app's file is counted on the last line, as the old page did (RFC 0.5 §10.7). No # topics: Ship
 * never shows them (Miky, 2–4 Nov).
 */
export interface TeamViewProps {
  /** The team's name; absent, "Untitled team". */
  name?: string
  /** Who is in the team: up to three faces and the number, the kit's pill, nothing to press. Absent: no pill. */
  members?: { faces: AvatarGroupMember[]; count: number }
  /** The ⋮'s rows; with neither, no ⋮. Only an owner or an admin may do either. */
  onRename?: () => void
  onArchive?: () => void
  /** An archived team's `ArchivedNotice`: the first thing on the page. */
  archivedNotice?: ReactNode
  /** Its initiatives; `loading` while read, `failed` when that read did not land. */
  initiatives: TeamInitiativeRow[] | 'loading' | 'failed'
  onRetryInitiatives?: () => void
  projects: TeamFileRow[]
  issues: TeamFileRow[]
  /** Other apps' files it holds that Ship does not list (a Leaf document, an app nobody wrote): counted on the last line. */
  others: number
  /** A person's face by their key. Default a dash: the number alone tells. */
  faceOf?: (pubkey: string) => AvatarGroupMember
  /** What Active counts back from, in ms: when the page opened. */
  now: number
}

const NO_FACE = (): AvatarGroupMember => ({ name: '—' })

/** Who is in it and when it was last active, as Explore lists them; both give way first in a narrow window (Peek's team page). */
const INITIATIVE_COLUMNS: ListTableColumn[] = [
  { label: 'Members', width: 'large', keep: 'low' },
  { label: 'Active', width: 'medium', keep: 'low' },
]

/** A team's page, as Peek's: its header, then its initiatives, projects and issues in the kit's lists. */
export function TeamView({ name, members, onRename, onArchive, archivedNotice, initiatives, onRetryInitiatives, projects, issues, others, faceOf = NO_FACE, now }: TeamViewProps) {
  const title = name ?? 'Untitled team'
  const nothing = Array.isArray(initiatives) && initiatives.length === 0 && projects.length === 0 && issues.length === 0
  return (
    // `data-surface` is the smoke test's waypoint, as the old Folder page's.
    <div className="flex h-full min-h-0 flex-col" data-surface="folder">
      <PageHeader
        leading={<IconUsers size={16} stroke={1.5} aria-hidden />}
        title={title}
        {...(members ? { members: <MembersPill readOnly members={members.faces.slice(0, 3)} count={members.count} /> } : {})}
        {...(onRename || onArchive
          ? {
              actions: (
                <Toolbar aria-label="Team actions" surface={false}>
                  <Menu
                    align="right"
                    trigger={
                      <ToolbarButton tooltip="More actions" aria-label="More actions">
                        <IconDotsVertical size={16} stroke={1.5} />
                      </ToolbarButton>
                    }
                  >
                    {onRename && <MenuItem label="Rename…" onClick={onRename} />}
                    {onArchive && <MenuItem label="Archive team…" onClick={onArchive} />}
                  </Menu>
                </Toolbar>
              ),
            }
          : {})}
      />
      {/* The page's whole width, 24px in, its parts 24px apart, as Peek's team page. */}
      <ScrollArea className="min-h-0 flex-1" contentClassName="flex flex-col gap-6 px-6 py-5">
        {archivedNotice}
        {nothing && others === 0 ? (
          <EmptyState scope="section" message="Nothing in this team yet." />
        ) : (
          <>
            {initiatives === 'loading' ? (
              <section className="flex flex-col gap-1">
                <SectionHeader title="Initiatives" hover="none" />
                <SkeletonList rows={3} />
              </section>
            ) : initiatives === 'failed' ? (
              <section className="flex flex-col gap-1">
                <SectionHeader title="Initiatives" hover="none" />
                <EmptyState scope="rows" message="Its initiatives didn’t load." {...(onRetryInitiatives ? { action: { label: 'Try again', onClick: onRetryInitiatives } } : {})} />
              </section>
            ) : (
              initiatives.length > 0 && (
                <section className="flex flex-col gap-1">
                  <SectionHeader title="Initiatives" count={initiatives.length} hover="none" />
                  <ListTable aria-label={`${title}’s initiatives`} columns={INITIATIVE_COLUMNS} headings={false}>
                    {initiatives.map((row) => (
                      <ListTableRow
                        key={row.address}
                        data-topic={row.address}
                        href={row.href}
                        label={row.title}
                        {...(row.summary ? { description: row.summary } : {})}
                        icon={<KindIcon kind="topic" />}
                        cells={[
                          row.members === undefined ? undefined : row.members === 0 ? '0' : <MembersPill readOnly members={(row.people ?? []).slice(0, 3).map(faceOf)} count={row.members} />,
                          row.active ? formatActive(row.active * 1000, now) : undefined,
                        ]}
                      />
                    ))}
                  </ListTable>
                </section>
              )
            )}
            <FileSection title="Projects" kind="project" rows={projects} team={title} now={now} />
            <FileSection title="Issues" kind="issue" rows={issues} team={title} now={now} />
            {/* What Ship does not list, counted, so a short list is not taken for the whole team (RFC 0.5 §10.7). */}
            {/* px-2: the same 8px in as the headings' own titles (SectionHeader), so the line starts where they do. */}
            {others > 0 && <p className="px-2 text-caption text-text-muted">{others === 1 ? '1 other file, listed in Peek' : `${others} other files, listed in Peek`}</p>}
          </>
        )}
      </ScrollArea>
    </div>
  )
}

/** A project's facts, as the Projects list shows them; they give way in a narrow window, progress last. */
const PROJECT_COLUMNS: ListTableColumn[] = [
  { label: 'Status', width: 'medium', keep: 'low' },
  { label: 'Lead', width: 'small', keep: 'low' },
  { label: 'Progress', width: 'large' },
]

/** An issue's facts, as the Issues list shows them; the same widths as a project's, so the two lists' columns line up. */
const ISSUE_COLUMNS: ListTableColumn[] = [
  { label: 'Status', width: 'medium', keep: 'low' },
  { label: 'Assignee', width: 'small', keep: 'low' },
  { label: 'Updated', width: 'large' },
]

/**
 * One kind of Ship's own files: the kit's list under its heading. With no facts, as Peek's team page lists its Files,
 * each row its icon and name; with facts, Ship's own lists' columns, headings off (the heading over it names the list).
 */
function FileSection({ title, kind, rows, team, now }: { title: string; kind: 'project' | 'issue'; rows: TeamFileRow[]; team: string; now: number }) {
  if (rows.length === 0) return null
  const facts = rows.some((row) => row.status || row.person || row.progress || row.at)
  const face = (row: TeamFileRow) => row.person && <Avatar name={row.person.name} src={row.person.picture} bot={row.person.bot} size={16} label={row.person.name} />
  const cellsOf = (row: TeamFileRow) =>
    !facts
      ? []
      : kind === 'project'
        ? [row.status && <StatusLabel value={row.status.value} label={row.status.label} size="small" />, face(row), row.progress && <ProjectProgress {...row.progress} wide />]
        : [row.status && <StatusLabel value={row.status.value} label={row.status.label} size="small" />, face(row), row.at ? ago(row.at, now) : undefined]
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader title={title} count={rows.length} hover="none" />
      <ListTable aria-label={`${team}’s ${title.toLowerCase()}`} columns={facts ? (kind === 'project' ? PROJECT_COLUMNS : ISSUE_COLUMNS) : []} headings={false}>
        {rows.map((row) => (
          <ListTableRow key={row.address} href={row.href} label={row.title} icon={<KindIcon kind={kind} />} cells={cellsOf(row)} />
        ))}
      </ListTable>
    </section>
  )
}
