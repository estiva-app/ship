import { IconArchive, IconBox } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import { ProjectCard, type ProjectCardProps } from '@/components/ProjectCard'
import { DeletedProjectRow, type DeletedProjectRowProps } from '@/components/DeletedProjectRow'
import { useState } from 'react'

/**
 * The projects list, as production: the heading with "Add project", the
 * Active / Archived tabs — only when something is archived — and the card
 * grid at today's 260px minimum. Cards first; a rows view comes later with a
 * switch (ruling B6). "Add project" is always there (ruling B9); until
 * writes arrive (REW-5) the caller passes `addDisabledReason` and the button
 * is disabled with that reason as its tooltip — an action that cannot succeed
 * is not offered as one that can.
 */
export interface ProjectsViewProps {
  /** "Projects", or a Folder's ("Estiva HQ · Projects", SHIPS-5). */
  title?: string
  active: ProjectCardProps[]
  archived: ProjectCardProps[]
  /** Deleted projects, for the Archived tab's Deleted filter (ALO-5); none where delete is a request, which leaves nothing to list. */
  deleted?: DeletedProjectRowProps[]
  showArchived: boolean
  onShowArchived: (archived: boolean) => void
  onAddProject?: () => void
  /** Why "Add project" cannot be used right now; disables the button. */
  addDisabledReason?: string
}

export function ProjectsView({ title = 'Projects', active, archived, deleted = [], showArchived, onShowArchived, onAddProject, addDisabledReason }: ProjectsViewProps) {
  const [filter, setFilter] = useState<'archived' | 'deleted'>('archived')
  // With nothing archived, the Archived tab opens on what is there: the deleted ones.
  const current = archived.length ? filter : 'deleted'
  const showDeleted = showArchived && current === 'deleted' && deleted.length > 0
  const shown = showArchived ? archived : active
  return (
    // `data-surface` is the smoke test's waypoint — see IssuesView.
    <div data-surface="projects" className="flex flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-h3 text-text-primary">{title}</h1>
        <Button variant="primary" onClick={onAddProject} disabledReason={addDisabledReason}>
          Add project
        </Button>
      </div>
      {archived.length + deleted.length > 0 && (
        <Tabs
          tabs={[
            { id: 'active', label: 'Active', count: active.length },
            { id: 'archived', label: 'Archived', count: archived.length + deleted.length },
          ]}
          active={showArchived ? 'archived' : 'active'}
          onChange={(id) => onShowArchived(id === 'archived')}
        />
      )}
      {/* Archived as before, and Deleted: every deleted project, with who deleted it and Restore (SPEC §6.5). */}
      {showArchived && deleted.length > 0 && (
        <Tabs
          size="small"
          aria-label="Show"
          tabs={[
            { id: 'archived', label: 'Archived', count: archived.length },
            { id: 'deleted', label: 'Deleted', count: deleted.length },
          ]}
          active={current}
          onChange={(id) => setFilter(id === 'deleted' ? 'deleted' : 'archived')}
        />
      )}
      {showDeleted ? (
        <div className="flex flex-col divide-y divide-border-subtle">
          {deleted.map((project) => (
            <DeletedProjectRow key={project.href} {...project} />
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
          {shown.map((project) => (
            <ProjectCard key={project.href} {...project} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={showArchived ? <IconArchive size={16} stroke={1.5} /> : <IconBox size={16} stroke={1.5} />}
          message={showArchived ? 'Nothing archived.' : 'No projects yet.'}
        />
      )}
    </div>
  )
}
