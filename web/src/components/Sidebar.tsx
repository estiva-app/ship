import { IconBox, IconListDetails } from '@tabler/icons-react'
import { cn } from '@/lib/cn'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { NavItem } from './NavItem'

/**
 * The sidebar: today's contents (ruling A1) — Issues, Projects, then the
 * active projects under a "Projects" heading. No inbox, no "my issues", no
 * teams; a personal filter belongs to the list it filters.
 *
 * Every number here is open issues (ruling A2). The Projects entry therefore
 * carries no count: the only honest number for it would be the count of
 * active projects, which is a different quantity wearing the same clothes —
 * exactly the silent mix the audit found in today's app.
 *
 * Archived projects are out of the navigation entirely, as today; they stay
 * one click inside Projects, which is where you go when looking for something
 * rather than working on it.
 *
 * Desktop only: the narrow-screen drawer is parked (ruling A5).
 */
export interface SidebarProject {
  /** The identity — refs and titles collide, addresses do not. */
  addr: string
  title: string
  href: string
  /** Open issues in this project. */
  openCount: number
}

export interface SidebarProps {
  /** Open issues across the workspace, minus archived projects — as today. */
  openIssues: number
  issuesHref: string
  projectsHref: string
  /** Active projects only, in the order the caller wants them shown. */
  projects: SidebarProject[]
  /** Which entry the route is on. A project's `addr` marks its own row. */
  current: 'issues' | 'projects' | { projectAddr: string }
  className?: string
}

export function Sidebar({ openIssues, issuesHref, projectsHref, projects, current, className }: SidebarProps) {
  const isProject = typeof current === 'object'
  return (
    <nav
      aria-label="Workspace"
      className={cn(
        'flex w-60 shrink-0 flex-col gap-px overflow-y-auto border-r border-border-default bg-bg-surface px-2.5 py-3',
        className,
      )}
    >
      <NavItem
        label="Issues"
        href={issuesHref}
        icon={<IconListDetails size={16} stroke={1.5} />}
        count={openIssues}
        active={current === 'issues'}
      />
      <NavItem
        label="Projects"
        href={projectsHref}
        icon={<IconBox size={16} stroke={1.5} />}
        active={current === 'projects'}
      />
      {projects.length > 0 && (
        <>
          <div className="mt-2 flex h-8 items-center px-2">
            <SectionLabel>Projects</SectionLabel>
          </div>
          {projects.map((project) => (
            <NavItem
              key={project.addr}
              label={project.title}
              href={project.href}
              count={project.openCount}
              active={isProject && current.projectAddr === project.addr}
            />
          ))}
        </>
      )}
    </nav>
  )
}
