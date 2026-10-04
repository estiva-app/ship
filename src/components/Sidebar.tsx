import { IconArrowUpRight, IconBox, IconListDetails, IconPlus } from '@tabler/icons-react'
import { NavTree, Sidebar as SidebarShell, type NavTreeGroup, type NavTreeNode } from '@estiva-app/ui'
import { MenuItem } from '@/components/ui/Menu'
import { placedIn } from '@/lib/placement'
import { linkTo } from '@/router'
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
/** Each team's fold is remembered under this key and its id (`ship.sidebar.team.<id>`); "Not in a Folder" under `.unfiled`. */
const STORAGE_KEY = 'ship.sidebar.team'
const UNFILED = 'unfiled'

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
  const node = (project: SidebarProject): NavTreeNode => ({
    id: project.addr,
    label: project.title,
    href: project.href,
    count: project.openCount,
    countLabel: `${project.openCount} open`,
    /* The row's menu (FOL-7) is the row's own (UIG-44): the ⋮ shows while the
       row is pointed at or focused, in the count's place. */
    menu: onMoveProject ? <MenuItem label="Move to Folder…" onClick={() => onMoveProject(project)} /> : undefined,
  })
  const pending = (projects.length === 0 && loading) || (folders.length === 0 && foldersLoading)
  /*
    The teams as the package's tree (Katerina, 2 October): each team a group,
    open unless the reader closed it, its projects lightly indented under its
    name, the arrow on hover opening the Folder page. A project no team lists
    and whose own Folder is no team is under "Not in a Folder" — nothing is
    dropped for being unfiled; on production every active project is in
    exactly one team's state since FOL-6 (2026-09-29), so it is usually absent.
  */
  const groups: NavTreeGroup[] | null = pending
    ? null
    : [
        ...teams.map((team) => ({
          id: team.id,
          title: team.name ?? team.id,
          defaultOpen: true,
          actions: onOpenFolder
            ? [{ icon: <IconArrowUpRight size={16} stroke={1.5} />, tooltip: 'Open folder', onClick: () => onOpenFolder(team) }]
            : undefined,
          nodes: under(team).map(node),
        })),
        ...(unfiled.length > 0 ? [{ id: UNFILED, title: 'Not in a Folder', defaultOpen: true, nodes: unfiled.map(node) }] : []),
      ]
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
      {/*
        A quiet "Folders" label, its + on the right for a new top-level Folder
        (FOL-8), over the teams. No label while the first reads are out: which
        teams are coming is exactly what is not known yet.
      */}
      <NavTree
        title={pending ? undefined : 'Folders'}
        titleActions={onNewFolder ? [{ icon: <IconPlus size={16} stroke={1.5} />, tooltip: 'New folder', onClick: onNewFolder }] : undefined}
        groups={groups}
        selected={isProject ? current.projectAddr : undefined}
        onSelect={(selected, event) => linkTo(selected.href).onClick(event)}
        storageKey={STORAGE_KEY}
      />
    </SidebarShell>
  )
}
