import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import { ProjectCard, type ProjectCardProps } from '@/components/ProjectCard'

/**
 * The projects list, as production: the heading with "Add project", the
 * Active / Archived tabs — only when something is archived — and the card
 * grid at today's 260px minimum. Cards first; a rows view comes later with a
 * switch (ruling B6). "Add project" is always there (ruling B9); what it
 * does before REW-5 is the caller's.
 */
export interface ProjectsViewProps {
  active: ProjectCardProps[]
  archived: ProjectCardProps[]
  showArchived: boolean
  onShowArchived: (archived: boolean) => void
  onAddProject: () => void
}

export function ProjectsView({ active, archived, showArchived, onShowArchived, onAddProject }: ProjectsViewProps) {
  const shown = showArchived ? archived : active
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-h3 text-text-primary">Projects</h1>
        <Button variant="primary" onClick={onAddProject}>
          Add project
        </Button>
      </div>
      {archived.length > 0 && (
        <Tabs
          tabs={[
            { id: 'active', label: 'Active', count: active.length },
            { id: 'archived', label: 'Archived', count: archived.length },
          ]}
          active={showArchived ? 'archived' : 'active'}
          onChange={(id) => onShowArchived(id === 'archived')}
        />
      )}
      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          {shown.map((project) => (
            <ProjectCard key={project.href} {...project} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="py-12"
          message={showArchived ? 'Nothing archived.' : 'No projects yet. Create one to get a Folder you can share with Peek.'}
        />
      )}
    </div>
  )
}
