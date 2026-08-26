import { useMemo } from 'react'
import { PROJECT_STATUSES, lookupStatus, type DirectoryView, type FolderState } from '@/api'
import type { ProjectCardProps } from '@/components/ProjectCard'
import { ProjectsView } from '@/views/ProjectsView'
import { go, href } from '../router'

/** Until writes (REW-5), the one reason every write control gives. */
export const WRITES_LATER = 'Available after sign-in'

/**
 * The projects list from the fold, as the old app draws it
 * (`projectsView`): active or archived by the route, each card with its
 * issue and done counts, its author's face and its age. Nothing here
 * recomputes what the fold decided — `archived` and `status` are read off
 * the folded project.
 */
export function ProjectsPage({ state, directory, archived }: { state: FolderState; directory: DirectoryView; archived: boolean }) {
  const cards = useMemo(() => {
    const toCard = (project: FolderState['projects'][number]): ProjectCardProps => {
      const issues = state.issues.filter((issue) => issue.projectAddr === project.addr)
      const status = lookupStatus(PROJECT_STATUSES, project.status)
      return {
        href: href({ name: 'project', addr: project.addr, view: 'table' }),
        title: project.title,
        description: project.description || undefined,
        status: { value: status.value, label: status.label },
        issueCount: issues.length,
        doneCount: issues.filter((issue) => issue.status === 'done').length,
        author: directory.personOf(project.author),
        createdAt: project.createdAt,
        archived: project.archived,
      }
    }
    return {
      active: state.projects.filter((p) => !p.archived).map(toCard),
      archived: state.projects.filter((p) => p.archived).map(toCard),
    }
  }, [state, directory])

  return (
    <ProjectsView
      active={cards.active}
      archived={cards.archived}
      showArchived={archived}
      onShowArchived={(wantArchived) => go({ name: 'projects', archived: wantArchived })}
      addDisabledReason={WRITES_LATER}
    />
  )
}
