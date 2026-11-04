import { Card, KindIcon } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import type { ProjectRowData } from '@/lib/projects'
import { Person } from '@/components/ui/Person'
import { linkTo } from '@/router'
import { ProjectProgress } from './ProjectProgress'

/**
 * One project on Projects' cards, as the approved story draws it (Miky, 2 Nov): its name, a line with its Folder on
 * the whole workspace's list and its status on All and Archived, a wide bar of its issues, and its lead named. The
 * whole card is the link.
 */
export function ProjectCard({ project, showFolder, showStatus }: { project: ProjectRowData; showFolder: boolean; showStatus: boolean }) {
  const line = [showFolder && project.folder, showStatus && project.status.label].filter(Boolean).join(' · ')
  return (
    <Card {...linkTo(project.href)} data-project={project.addr} className="flex flex-col gap-3 p-3">
      <span className="flex items-start gap-2">
        <KindIcon kind="project" />
        <span className={cn('line-clamp-2 text-body-2 font-medium', project.archived ? 'text-text-muted' : 'text-text-primary')}>{project.title}</span>
      </span>
      {line && <span className="text-caption text-text-muted">{line}</span>}
      <ProjectProgress {...project.progress} archived={project.archived} wide />
      {project.lead && (
        <span className="text-caption text-text-secondary">
          <Person name={project.lead.name} picture={project.lead.picture} bot={project.lead.bot} size={24} />
        </span>
      )}
    </Card>
  )
}
