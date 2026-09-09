import { IconBox, IconFolder, IconListDetails } from '@tabler/icons-react'
import { CollapsibleSection, Sidebar as SidebarShell } from '@estiva-app/ui'
import { SkeletonBar } from '@/components/ui/Skeleton'
import { NavItem } from './NavItem'

/**
 * The sidebar: today's contents (ruling A1) — Issues, Projects, then the
 * active projects under a "Projects" heading. No inbox, no "my issues", no
 * teams; a personal filter belongs to the list it filters. The column
 * itself is the shared shell (2026-09-02); what fills it stays here.
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
const STORAGE = { projects: 'ship.sidebar.projects', folders: 'ship.sidebar.folders' }

export interface SidebarProject {
  /** The identity — refs and titles collide, addresses do not. */
  addr: string
  title: string
  href: string
  /** Open issues in this project. */
  openCount: number
}

/** A Folder, as the sidebar needs it. */
export interface SidebarFolder {
  /** The uuid — channel id, `h`, and the `d` of its state, all one (RFC 0.4 §5.2). */
  id: string
  /** Absent until something names it; the row falls back to the id. */
  name?: string
  href: string
}

export interface SidebarProps {
  /** Open issues across the workspace, minus archived projects — as today. */
  openIssues: number
  issuesHref: string
  projectsHref: string
  /** Active projects only, in the order the caller wants them shown. */
  projects: SidebarProject[]
  /**
   * Folders this identity can see.
   *
   * **No count**, unlike every other row here. A Folder's contents are files
   * from apps Ship does not own, so a number would either be Ship's records
   * only — which is a lie about a container that holds a topic — or a resolve
   * per Folder on every render. RFC 0.4 §4.2 also makes the count a disclosure
   * in its own right, so the honest sidebar states the name and nothing else.
   */
  folders?: SidebarFolder[]
  /** Which entry the route is on. A project's `addr` marks its own row. */
  current: 'issues' | 'projects' | { projectAddr: string } | { folderId: string }
  /** The first workspace read has not landed, so the project list is unknown
   *  rather than empty — SHI-20. Shows placeholder rows in its place. */
  loading?: boolean
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

export function Sidebar({ openIssues, issuesHref, projectsHref, projects, folders = [], current, loading = false, className }: SidebarProps) {
  /*
    Both branches of `current` are objects now, so `typeof current === 'object'`
    no longer distinguishes them — it was correct while a project route was the
    only object and became a latent bug the moment a folder route existed: a
    folder route would have marked a project row active. Keyed on the field
    instead, which cannot go wrong the same way again.
  */
  const isProject = typeof current === 'object' && 'projectAddr' in current
  const isFolder = typeof current === 'object' && 'folderId' in current
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
      {(projects.length > 0 || loading) && (
        <CollapsibleSection title="Projects" storageKey={STORAGE.projects} className="mt-2 shrink-0" contentClassName="gap-px">
          {projects.length === 0 && loading ? (
            <SkeletonProjects />
          ) : (
            projects.map((project) => (
              <NavItem
                key={project.addr}
                label={project.title}
                href={project.href}
                count={project.openCount}
                countLabel={`${project.openCount} open`}
                active={isProject && current.projectAddr === project.addr}
              />
            ))
          )}
        </CollapsibleSection>
      )}
      {folders.length > 0 && (
        <CollapsibleSection title="Folders" storageKey={STORAGE.folders} className="mt-2 shrink-0" contentClassName="gap-px">
          {folders.map((folder) => (
            <NavItem
              key={folder.id}
              label={folder.name ?? folder.id}
              href={folder.href}
              icon={<IconFolder size={16} stroke={1.5} />}
              active={isFolder && current.folderId === folder.id}
            />
          ))}
        </CollapsibleSection>
      )}
    </SidebarShell>
  )
}
