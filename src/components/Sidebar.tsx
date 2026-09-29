import { IconArrowUpRight, IconBox, IconDots, IconFolderPlus, IconListDetails } from '@tabler/icons-react'
import { CollapsibleSection, Sidebar as SidebarShell } from '@estiva-app/ui'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { placedIn } from '@/lib/placement'
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
 * to say (`topLevelFolders` — the ones with state that nothing lists).
 *
 * **Which project is under which team is the team's state** (FOL-5): the
 * projects its `kind:30890` lists, which is what Peek's Folders column draws
 * under it. Until then Ship grouped by each project's own `contentFolder`, so
 * the two apps placed projects from different sources and disagreed, and six
 * active projects sat under a catch-all titled "Projects" that read like a
 * Folder. `contentFolder` is now only the fallback, for a project no state
 * lists whose own Folder is a team — a project created a moment ago, before
 * the listing is read again. One that is genuinely in no team is under "Not
 * in a team", which is not named like a Folder because it is not one.
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
const STORAGE = { unfiled: 'ship.sidebar.unfiled', team: (id: string) => `ship.sidebar.team.${id}` }

export interface SidebarProject {
  /** The identity — refs and titles collide, addresses do not. */
  addr: string
  title: string
  href: string
  /** Open issues in this project. */
  openCount: number
  /**
   * The project's own Folder — its `contentFolder`. Absent when it names none.
   * Only the fallback for placing it: see {@link SidebarFolder.addresses}.
   */
  folder?: string
}

/** A top-level Folder — a team — as the sidebar needs it. */
export interface SidebarFolder {
  /** The uuid — channel id, `h`, and the `d` of its state, all one (RFC 0.4 §5.2). */
  id: string
  /** Absent until something names it; the fold falls back to the id. */
  name?: string
  /**
   * What the team's state lists (`FolderSummary.addresses`). A project whose
   * `addr` is here is one of the team's rows, wherever its own Folder is.
   */
  addresses?: string[]
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
  /** "Move to Folder…" in a project row's menu (FOL-7). Absent, the rows have no menu. */
  onMoveProject?: (project: SidebarProject) => void
  /**
   * "New folder" under the teams (FOL-8): a new top-level Folder, which then
   * shows here beside them. Absent, there is no such entry.
   */
  onNewFolder?: () => void
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

export function Sidebar({ openIssues, issuesHref, projectsHref, projects, folders = [], onOpenFolder, onMoveProject, onNewFolder, current, loading = false, foldersLoading = false, className }: SidebarProps) {
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
  // The teams whose state lists it; failing that, its own Folder if that is a team (`placedIn`, which the project rail names too).
  const placed = new Map(projects.map((project) => [project.addr, placedIn(project, teams)]))
  const under = (team: SidebarFolder) => projects.filter((project) => placed.get(project.addr)!.includes(team))
  const unfiled = projects.filter((project) => placed.get(project.addr)!.length === 0)
  const row = (project: SidebarProject) => {
    const item = (
      <NavItem
        key={project.addr}
        label={project.title}
        href={project.href}
        count={project.openCount}
        countLabel={`${project.openCount} open`}
        active={isProject && current.projectAddr === project.addr}
      />
    )
    if (!onMoveProject) return item
    /*
      The row's menu (FOL-7): shown while the row is hovered or has focus, over
      the count, as a section's actions are over its header. Beside the link,
      not inside it — a button inside an anchor is not a button.
    */
    return (
      <div key={project.addr} className="group/row relative">
        {item}
        <div className="absolute inset-y-0 right-1 flex items-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <Menu
            align="right"
            trigger={
              <IconButton tooltip="More options" aria-label={`More options for ${project.title}`}>
                <IconDots size={16} stroke={1.5} />
              </IconButton>
            }
          >
            <MenuItem label="Move to Folder…" onClick={() => onMoveProject(project)} />
          </Menu>
        </div>
      </div>
    )
  }
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
        /* No title: which teams are coming is exactly what is not known yet,
           and a heading here would be one more section named like a Folder. */
        <div className="mt-2 shrink-0">
          <SkeletonProjects />
        </div>
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
            A project no team lists and whose own Folder is no team. Nothing
            is dropped from the navigation for being unfiled; on production
            every active project is in exactly one team's state since FOL-6
            (2026-09-29), so this fold is usually absent.
          */}
          {unfiled.length > 0 && (
            <CollapsibleSection title="Not in a team" storageKey={STORAGE.unfiled} className="mt-2 shrink-0" contentClassName="gap-px">
              {unfiled.map(row)}
            </CollapsibleSection>
          )}
          {/*
            After the teams, not in a heading above them: there is no
            "Folders" heading to hang it on, and one would be a section named
            like a Folder that is not one. Peek puts the same action in its
            Folders column's header, which Ship's sidebar does not have.
          */}
          {onNewFolder && (
            <div className="mt-2 flex shrink-0">
              <Button variant="muted" size="small" leadingIcon={<IconFolderPlus size={16} stroke={1.5} />} onClick={onNewFolder}>
                New folder
              </Button>
            </div>
          )}
        </>
      )}
    </SidebarShell>
  )
}
