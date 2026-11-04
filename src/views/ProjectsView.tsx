import { useState } from 'react'
import { IconLayoutGrid, IconList } from '@tabler/icons-react'
import { DeletedProjectRow, type DeletedProjectRowProps } from '@/components/DeletedProjectRow'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectRow } from '@/components/ProjectRow'
import type { ProjectRowData } from '@/lib/projects'
import { PROJECTS_TABS, type ProjectsTab } from '@/router'

/**
 * Ship's Projects, as the approved story draws it (estiva-ui `concept/cross-app-navigation`, `ShipTopics.tsx`;
 * Miky, 2 Nov): tabs All, Planned, Active, Completed and Archived, each with its count, over a table or cards, which
 * a switch beside "Add project" chooses. A Folder's Projects is the same view with its name before the title and no
 * Folder column. "Add project" is always there (ruling B9); `addDisabledReason` disables it with that reason.
 */
export interface ProjectsViewProps {
  /** "Projects", or a Folder's ("Estiva HQ · Projects", SHIPS-5). */
  title?: string
  lists: Record<ProjectsTab, ProjectRowData[]>
  tab: ProjectsTab
  onTab: (tab: ProjectsTab) => void
  layout: ProjectsLayout
  onLayout: (layout: ProjectsLayout) => void
  /** The whole workspace's list names each project's Folder; a Folder's own does not. */
  showFolder: boolean
  onAddProject?: () => void
  /** Why "Add project" cannot be used right now; disables the button. */
  addDisabledReason?: string
  /** Deleted projects, for the Archived tab's Deleted filter (ALO-5); none where delete is a request, which leaves nothing to list. */
  deleted?: DeletedProjectRowProps[]
  /** The deleted ones' titles are still on their way: their rows draw as loading. */
  deletedLoading?: boolean
}

export type ProjectsLayout = 'table' | 'cards'

const TABS: Record<ProjectsTab, string> = { all: 'All', planned: 'Planned', active: 'Active', completed: 'Completed', archived: 'Archived' }
const EMPTY: Record<ProjectsTab, string> = {
  all: 'No projects here.',
  planned: 'No planned projects.',
  active: 'No active projects.',
  completed: 'No completed projects.',
  archived: 'No archived projects.',
}

export function ProjectsView({ title = 'Projects', lists, tab, onTab, layout, onLayout, showFolder, onAddProject, addDisabledReason, deleted = [], deletedLoading = false }: ProjectsViewProps) {
  const [filter, setFilter] = useState<'archived' | 'deleted'>('archived')
  // With nothing archived, the Archived tab opens on what is there: the deleted ones.
  const showDeleted = tab === 'archived' && deleted.length > 0 && (lists.archived.length === 0 || filter === 'deleted')
  const list = lists[tab]
  // A tab that is one status says it already; All and Archived mix them.
  const showStatus = tab === 'all' || tab === 'archived'
  return (
    // `data-surface` and `data-view` are the smoke test's waypoints — see IssuesView.
    <div data-surface="projects" data-view={layout} className="flex flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-h3 text-text-primary">{title}</h1>
        <span className="flex items-center gap-1">
          <IconButton aria-label="Table" tooltip="Table" pressed={layout === 'table'} onClick={() => onLayout('table')}>
            <IconList size={16} stroke={1.5} />
          </IconButton>
          <IconButton aria-label="Cards" tooltip="Cards" pressed={layout === 'cards'} onClick={() => onLayout('cards')}>
            <IconLayoutGrid size={16} stroke={1.5} />
          </IconButton>
        </span>
        <Button variant="primary" onClick={onAddProject} disabledReason={addDisabledReason}>
          Add project
        </Button>
      </div>
      <Tabs<ProjectsTab>
        aria-label="Projects by status"
        tabs={PROJECTS_TABS.map((id) => ({ id, label: TABS[id], count: lists[id].length + (id === 'archived' ? deleted.length : 0) }))}
        active={tab}
        onChange={onTab}
      />
      {/* Archived as before, and Deleted: every deleted project, with who deleted it and Restore (SPEC §6.5). */}
      {tab === 'archived' && deleted.length > 0 && (
        <Tabs
          size="small"
          aria-label="Show"
          tabs={[
            { id: 'archived', label: 'Archived', count: lists.archived.length },
            { id: 'deleted', label: 'Deleted', count: deleted.length },
          ]}
          active={showDeleted ? 'deleted' : 'archived'}
          onChange={(id) => setFilter(id === 'deleted' ? 'deleted' : 'archived')}
        />
      )}
      {showDeleted && deletedLoading ? (
        <SkeletonList rows={deleted.length} />
      ) : showDeleted ? (
        <div className="flex flex-col divide-y divide-border-subtle">
          {deleted.map((project) => (
            <DeletedProjectRow key={project.href} {...project} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState scope="section" message={EMPTY[tab]} />
      ) : layout === 'table' ? (
        <div className="flex flex-col gap-2">
          <div className="hidden items-center gap-3 px-3 text-caption text-text-muted sm:flex">
            <span className="flex-1 pl-7">Name</span>
            {showFolder && <span className="hidden w-24 md:inline">Team</span>}
            {showStatus && <span className="w-20">Status</span>}
            <span className="w-10">Lead</span>
            <span className="w-36">Progress</span>
          </div>
          {/* Rows as Ship's issue list and Topics draw them: the story's bordered box is no package part. */}
          <div className="flex flex-col gap-px">
            {list.map((project) => (
              <ProjectRow key={project.addr} project={project} showFolder={showFolder} showStatus={showStatus} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((project) => (
            <ProjectCard key={project.addr} project={project} showFolder={showFolder} showStatus={showStatus} />
          ))}
        </div>
      )}
    </div>
  )
}
