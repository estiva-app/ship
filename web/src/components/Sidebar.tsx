import { IconBox, IconListDetails } from '@tabler/icons-react'
import { Sidebar as SidebarShell } from '@estiva-app/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
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
      {projects.length > 0 && (
        <>
          <div className="mt-2 flex h-8 shrink-0 items-center px-2">
            <SectionLabel>Projects</SectionLabel>
          </div>
          {projects.map((project) => (
            <NavItem
              key={project.addr}
              label={project.title}
              href={project.href}
              count={project.openCount}
              countLabel={`${project.openCount} open`}
              active={isProject && current.projectAddr === project.addr}
            />
          ))}
        </>
      )}
    </SidebarShell>
  )
}
