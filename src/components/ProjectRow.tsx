import { Avatar, KindIcon, Link } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import type { ProjectRowData } from '@/lib/projects'
import { linkTo } from '@/router'
import { ProjectProgress } from './ProjectProgress'

/**
 * One project in Projects' table, as the approved story draws it (Miky, 2 Nov): its name, its Folder on the whole
 * workspace's list, its status on All and Archived, its lead's face and its progress. On a phone only the name and
 * the count stay.
 */
export function ProjectRow({ project, showFolder, showStatus }: { project: ProjectRowData; showFolder: boolean; showStatus: boolean }) {
  return (
    <div data-project={project.addr} className="relative flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-bg-hover">
      <KindIcon kind="project" />
      <span className={cn('flex min-w-0 flex-1 text-body-2', project.archived ? 'text-text-muted' : 'text-text-primary')}>
        <Link {...linkTo(project.href)} variant="plain" cover truncate className="min-w-0">
          {project.title}
        </Link>
      </span>
      {showFolder && <span className="hidden w-24 shrink-0 truncate text-caption text-text-muted md:inline">{project.folder}</span>}
      {showStatus && <span className="hidden w-20 shrink-0 truncate text-caption text-text-secondary sm:inline">{project.status.label}</span>}
      <span className="hidden w-10 shrink-0 sm:block">
        {project.lead && <Avatar name={project.lead.name} src={project.lead.picture} bot={project.lead.bot} size={24} label={project.lead.name} />}
      </span>
      <ProjectProgress {...project.progress} archived={project.archived} />
    </div>
  )
}
