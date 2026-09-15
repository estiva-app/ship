import { IconArrowUpRight, IconBox, IconListDetails } from '@tabler/icons-react'
import { CollapsibleSection, Sidebar as SidebarShell } from '@estiva-app/ui'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { NavItem } from './NavItem'

/**
 * The sidebar: Issues, Projects, then the active projects **under their
 * team** — one fold per top-level Folder, its projects as the rows (SHI-25).
 * No inbox, no "my issues"; a personal filter belongs to the list it filters.
 * The column itself is the shared shell (2026-09-02); what fills it stays
 * here.
 *
 * Until 2026-09-15 the projects were one flat list and every Folder the
 * relay answered with was a row under a "Folders" heading — on production
 * fifty-odd, most of them Ship's own record channels. Miky's ruling: "in both
 * Peek and Ship have 5 folders — Estiva HQ, Ship, Peek, Steer, Leaf. Under
 * those there should be all the topics and projects. The issues should be
 * under the dedicated project." Which Folders are the teams is the caller's
 * to say (`topLevelFolders` — the ones with state that nothing lists); which
 * project is under which team is Ship's own fold (`Project.contentFolder`,
 * the Folder `ship link-project` re-points it at). A project whose Folder is
 * no team keeps a row under a plain "Projects" fold rather than vanishing.
 *
 * A team's title toggles its fold; the arrow on hover opens the Folder page,
 * which lists everything in it — the topics Peek filed there beside the
 * projects. The issues are one more click: a project's row opens the project.
 *
 * Two kinds of number, each saying what it counts in its tooltip (ruling
 * A2): the Issues entry and every project row count OPEN issues ("18 open");
 * the Projects entry counts ACTIVE projects ("5 active"), as today — restored
 * on Katerina's ruling (2026-08-26) after a first cut dropped it.
 *
 * Archived projects are out of the navigation entirely, as today; they stay
 * one click inside Projects, which is where you go when looking for something
 * rather than working on it.
 *
 * The two groups fold (Katerina, 2026-09-09): each is a `CollapsibleSection`,
 * and this browser remembers how you left it under the keys below. A closed
 * group stays closed even on one of its own routes — the reader closed it.
 *
 * Desktop only: the narrow-screen drawer is parked (ruling A5).
 */
const STORAGE = { projects: 'ship.sidebar.projects', team: (id: string) => `ship.sidebar.team.${id}` }

export interface SidebarProject {
  /** The identity — refs and titles collide, addresses do not. */
  addr: string
  title: string
  href: string
  /** Open issues in this project. */
  openCount: number
  /** The Folder the project is under — its `contentFolder`. Absent when it names none. */
  folder?: string
}

/** A top-level Folder — a team — as the sidebar needs it. */
export interface SidebarFolder {
  /** The uuid — channel id, `h`, and the `d` of its state, all one (RFC 0.4 §5.2). */
  id: string
  /** Absent until something names it; the fold falls back to the id. */
  name?: string
}

export interface SidebarProps {
  /** Open issues across the workspace, minus archived projects — as today. */
  openIssues: number
  issuesHref: string
  projectsHref: string
  /** Active projects only, in the order the caller wants them shown. */
  projects: SidebarProject[]
  /**
   * The teams: the top-level Folders, each a fold over its projects. Which
   * Folders those are is the caller's reading (`topLevelFolders`).
   *
   * **No count on a team**, unlike every other row here. A Folder's contents
   * are files from apps Ship does not own, so a number would either be Ship's
   * records only — which is a lie about a container that holds a topic — or a
   * resolve per Folder on every render. RFC 0.4 §4.2 also makes the count a
   * disclosure in its own right, so the fold states the name and nothing else.
   */
  folders?: SidebarFolder[]
  /** The arrow on a team's fold: open the Folder page. */
  onOpenFolder?: (folder: SidebarFolder) => void
  /** Which entry the route is on. A project's `addr` marks its own row. */
  current: 'issues' | 'projects' | { projectAddr: string } | { folderId: string }
  /** The first workspace read has not landed, so the project list is unknown
   *  rather than empty — SHI-20. Shows placeholder rows in its place. */
  loading?: boolean
  /**
   * The Folders are read separately and have not landed, so which team a
   * project is under is unknown — the same placeholder rows, rather than a
   * flat list that regroups itself a moment later.
   */
  foldersLoading?: boolean
  className?: string
}

/**
 * The project rows before they arrive.
 *
 * Built here from `SkeletonBar` rather than taken as `SkeletonList`, because
 * the shared list draws a 16px square for a row that has a face or an icon and
 * a project row has neither — the package's own note keeps app-shaped
 * placeholders in the app. The row is `NavItem`'s: 32px, `px-2`.
 *
 * `animate-skeleton-in` holds it back 150ms, so a fast read never flashes a
 * placeholder on the way past.
 */
const PLACEHOLDER_WIDTHS = [104, 78, 122, 90]

function SkeletonProjects() {
  return (
    <div className="flex flex-col gap-0.5 animate-skeleton-in" aria-hidden>
      {PLACEHOLDER_WIDTHS.map((width, i) => (
        <div key={i} className="flex h-8 shrink-0 items-center px-2">
          <SkeletonBar className="h-3.5" style={{ width }} />
        </div>
      ))}
    </div>
  )
}

export function Sidebar({ openIssues, issuesHref, projectsHref, projects, folders = [], onOpenFolder, current, loading = false, foldersLoading = false, className }: SidebarProps) {
  /*
    Both branches of `current` are objects now, so `typeof current === 'object'`
    no longer distinguishes them — it was correct while a project route was the
    only object and became a latent bug the moment a folder route existed: a
    folder route would have marked a project row active. Keyed on the field
    instead, which cannot go wrong the same way again.
  */
  const isProject = typeof current === 'object' && 'projectAddr' in current
  /*
    Grouped here rather than by the caller, so a story can hand in the two
    lists production hands in. Alphabetical teams, as Peek's column draws
    them; a project keeps the caller's order inside its team. The relay's
    order tells the person nothing.
  */
  const teams = [...folders].sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' }),
  )
  const teamIds = new Set(teams.map((team) => team.id))
  const under = (team: SidebarFolder) => projects.filter((project) => project.folder === team.id)
  const elsewhere = projects.filter((project) => !project.folder || !teamIds.has(project.folder))
  const row = (project: SidebarProject) => (
    <NavItem
      key={project.addr}
      label={project.title}
      href={project.href}
      count={project.openCount}
      countLabel={`${project.openCount} open`}
      active={isProject && current.projectAddr === project.addr}
    />
  )
  const pending = (projects.length === 0 && loading) || (folders.length === 0 && foldersLoading)
  return (
    <SidebarShell className={className}>
      <NavItem
        label="Issues"
        href={issuesHref}
        icon={<IconListDetails size={16} stroke={1.5} />}
        count={openIssues}
        countLabel={`${openIssues} open`}
        active={current === 'issues'}
      />
      <NavItem
        label="Projects"
        href={projectsHref}
        icon={<IconBox size={16} stroke={1.5} />}
        count={projects.length}
        countLabel={`${projects.length} active`}
        active={current === 'projects'}
      />
      {pending ? (
        <CollapsibleSection title="Projects" storageKey={STORAGE.projects} className="mt-2 shrink-0" contentClassName="gap-px">
          <SkeletonProjects />
        </CollapsibleSection>
      ) : (
        <>
          {teams.map((team) => (
            <div key={team.id} data-sidebar-team={team.id} className="mt-2 shrink-0">
              <CollapsibleSection
                title={team.name ?? team.id}
                storageKey={STORAGE.team(team.id)}
                contentClassName="gap-px"
                actions={
                  onOpenFolder
                    ? [{ icon: <IconArrowUpRight size={16} stroke={1.5} />, tooltip: 'Open folder', onClick: () => onOpenFolder(team) }]
                    : []
                }
              >
                {under(team).map(row)}
              </CollapsibleSection>
            </div>
          ))}
          {/*
            A project under no team, or under a Folder that is not one. Nothing
            is dropped from the navigation for being unfiled; on production
            every project is under a team since 2026-09-15, so this fold is
            usually absent.
          */}
          {elsewhere.length > 0 && (
            <CollapsibleSection title="Projects" storageKey={STORAGE.projects} className="mt-2 shrink-0" contentClassName="gap-px">
              {elsewhere.map(row)}
            </CollapsibleSection>
          )}
        </>
      )}
    </SidebarShell>
  )
}
