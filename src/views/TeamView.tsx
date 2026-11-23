import type { ReactNode } from 'react'
import { IconDotsVertical, IconUsers } from '@tabler/icons-react'
import { ItemList, ListSection, Menu, MenuItem, MembersPill, PageHeader, Toolbar, ToolbarButton, type AvatarGroupMember } from '@estiva-app/ui'
import { workItems, type WorkItem } from '@/components/workItems'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SkeletonList } from '@/components/ui/Skeleton'

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

/** One of Ship's own files the team holds, as the kit's `ItemList` draws it: its status, lead or assignee, progress, last change. */
export type TeamFileRow = Omit<WorkItem, 'members' | 'description'>

/**
 * **A team's page in Ship, drawn as Peek's** (Katerina, 18 November, D6: "show me the before and after"): the kit's
 * `PageHeader` with the team's icon, its name, who is in it and its ⋮ (Rename and Archive…, Peek's words, for its owners
 * and admins); then the kit's lists, one per kind, each under a heading with its count — its **Initiatives** as Explore lists
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
  /**
   * Its files were read from its chat's contents, as no list of its own exists yet: the short list is then the only
   * symptom, so the last line says why, in the old page's words.
   */
  fromChannel?: boolean
  /** A person's face by their key. Default a dash: the number alone tells. */
  faceOf?: (pubkey: string) => AvatarGroupMember
  /** What Active counts back from, in ms: when the page opened. */
  now: number
  /** The team's id, marked on the page with where its list came from, as the old Folder page did: the smoke test finds the page and checks the read by them. */
  teamId?: string
}

const NO_FACE = (): AvatarGroupMember => ({ name: '—' })

/** A team's page, as Peek's: its header, then its initiatives, projects and issues in the kit's lists. */
export function TeamView({ name, members, onRename, onArchive, archivedNotice, initiatives, onRetryInitiatives, projects, issues, others, fromChannel = false, faceOf = NO_FACE, now, teamId }: TeamViewProps) {
  const title = name ?? 'Untitled team'
  const nothing = Array.isArray(initiatives) && initiatives.length === 0 && projects.length === 0 && issues.length === 0
  return (
    // `data-surface`, `data-folder` and `data-source` are the smoke test's waypoints, as the old Folder page's.
    <div className="flex h-full min-h-0 flex-col" data-surface="folder" data-folder={teamId} data-source={fromChannel ? 'channel' : 'state'}>
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
                    {onRename && <MenuItem label="Rename" onClick={onRename} />}
                    {onArchive && <MenuItem label="Archive…" onClick={onArchive} />}
                  </Menu>
                </Toolbar>
              ),
            }
          : {})}
      />
      {/* The page's whole width, 24px in, its parts 24px apart, as Peek's team page. */}
      <ScrollArea className="min-h-0 flex-1" contentClassName="flex flex-col gap-6 px-6 py-5">
        {/* The page's heading for assistive technology: the kit's PageHeader draws its title as text, not a heading (a kit gap). */}
        <h1 className="sr-only">{title}</h1>
        {archivedNotice}
        {nothing && others === 0 && !fromChannel ? (
          <EmptyState scope="section" message="Nothing in this team yet." />
        ) : (
          <>
            {initiatives === 'loading' ? (
              <ListSection title="Initiatives">
                <SkeletonList rows={3} />
              </ListSection>
            ) : initiatives === 'failed' ? (
              <ListSection title="Initiatives">
                {/* The section-level line (the row-level one draws no button), in a box 8px in, where the headings start: the gate puts the room on the box, not on the part. */}
                <div className="px-2">
                  <EmptyState scope="section" message="Its initiatives didn’t load." {...(onRetryInitiatives ? { action: { label: 'Try again', onClick: onRetryInitiatives } } : {})} />
                </div>
              </ListSection>
            ) : (
              initiatives.length > 0 && (
                <ListSection title="Initiatives" count={initiatives.length}>
                  {/* The same columns as Projects and Issues below, so its people and its Active stack with theirs. */}
                  <ItemList
                    aria-label={`${title}’s initiatives`}
                    rows={workItems(
                      'topic',
                      initiatives.map((row) => ({
                        address: row.address,
                        title: row.title,
                        href: row.href,
                        ...(row.summary ? { description: row.summary } : {}),
                        ...(row.members !== undefined ? { members: { faces: (row.people ?? []).slice(0, 3).map(faceOf), count: row.members } } : {}),
                        ...(row.active ? { at: row.active } : {}),
                      })),
                      now,
                    )}
                  />
                </ListSection>
              )
            )}
            <FileSection title="Projects" kind="project" rows={projects} team={title} now={now} />
            <FileSection title="Issues" kind="issue" rows={issues} team={title} now={now} />
            {/* What Ship does not list, counted, so a short list is not taken for the whole team (RFC 0.5 §10.7). */}
            {/* px-2: the same 8px in as the headings' own titles (SectionHeader), so the line starts where they do. */}
            {others > 0 && <p className="px-2 text-caption text-text-muted">{others === 1 ? '1 other file, listed in Peek' : `${others} other files, listed in Peek`}</p>}
            {fromChannel && <p className="px-2 text-caption text-text-muted">From channel contents; this team has no list of its own yet.</p>}
          </>
        )}
      </ScrollArea>
    </div>
  )
}

/** One kind of Ship's own files under its heading with its count: the kit's `ItemList`, as the initiative page lists them. */
function FileSection({ title, kind, rows, team, now }: { title: string; kind: 'project' | 'issue'; rows: TeamFileRow[]; team: string; now: number }) {
  if (rows.length === 0) return null
  return (
    <ListSection title={title} count={rows.length}>
      <ItemList aria-label={`${team}’s ${title.toLowerCase()}`} rows={workItems(kind, rows, now)} />
    </ListSection>
  )
}
