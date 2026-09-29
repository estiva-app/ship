import { useMemo, useState } from 'react'
import { PROJECT_STATUSES, createProject, lookupStatus, type DirectoryView, type FolderState } from '@/api'
import type { FolderSummary } from '@estiva-app/interop'
import { renderTreeText, toRenderTree } from '@estiva-app/protocol'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import type { ProjectCardProps } from '@/components/ProjectCard'
import { ProjectsView } from '@/views/ProjectsView'
import { go, href } from '../router'
import { type Say } from './act'

/**
 * The projects list from the fold, as the old app draws it
 * (`projectsView`): active or archived by the route, each card with its
 * issue and done counts, its author's face and its age. Nothing here
 * recomputes what the fold decided — `archived` and `status` are read off
 * the folded project. "Add project" opens the form in a dialog; a created
 * project is on screen only once the relay has been read again.
 */
export function ProjectsPage({ state, directory, teams, archived, say, refresh }: { state: FolderState; directory: DirectoryView; teams: FolderSummary[] | undefined; archived: boolean; say: Say; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)

  const cards = useMemo(() => {
    const toCard = (project: FolderState['projects'][number]): ProjectCardProps => {
      const issues = state.issues.filter((issue) => issue.projectAddr === project.addr)
      const status = lookupStatus(PROJECT_STATUSES, project.status)
      return {
        href: href({ name: 'project', d: project.id, slug: project.title, view: 'table' }),
        title: project.title,
        // The words a reader would see, never the stored document: a description saved by the editor is a block
        // document, and the card printed its JSON (found 30 September).
        description: renderTreeText(toRenderTree(project.description, project.descriptionFormat)).trim() || undefined,
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
    <>
      <ProjectsView
        active={cards.active}
        archived={cards.archived}
        showArchived={archived}
        onShowArchived={(wantArchived) => go({ name: 'projects', archived: wantArchived })}
        onAddProject={() => setAdding(true)}
      />
      {adding && (
        <NewProjectDialog
          teams={teams?.map((team) => ({ id: team.id, name: team.name ?? `Folder ${team.id.slice(0, 8)}…`, hasState: team.hasState }))}
          onClose={() => setAdding(false)}
          onCreate={async (draft) => {
            const result = await createProject(draft)
            if (!result.ok) {
              say(`Project rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            if (result.unlisted) say(`Project created, but not listed in its team, so Peek will not show it there — ${result.unlisted}`, 'error')
            else say('Project created')
            return true
          }}
        />
      )}
    </>
  )
}
