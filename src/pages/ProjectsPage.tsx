import { useMemo, useState } from 'react'
import { PROJECT_STATUSES, createProject, lookupStatus, type DirectoryView, type FolderState } from '@/api'
import type { FolderSummary } from '@estiva-app/interop'
import { renderTreeText, toRenderTree } from '@estiva-app/protocol'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import type { ProjectCardProps } from '@/components/ProjectCard'
import { ProjectsView } from '@/views/ProjectsView'
import type { Archives } from '@/lib/archive'
import { go, href } from '../router'
import { type Say } from './act'

/**
 * The projects list from the fold, as the old app draws it
 * (`projectsView`): active or archived by the route, each card with its
 * issue and done counts, its author's face and its age. Nothing here
 * recomputes what the fold decided — `archived` and `status` are read off
 * the folded project. "Add project" opens the form in a dialog; a created
 * project is on screen only once the relay has been read again.
 *
 * Archived is FOL-46's (`archivesOf`): a project archived itself or with its
 * team is on the Archived tab, and a card counts only the issues not archived
 * on their own.
 */
export function ProjectsPage({ state, directory, teams, archives, archived, say, refresh }: { state: FolderState; directory: DirectoryView; teams: FolderSummary[] | undefined; archives: Archives; archived: boolean; say: Say; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)

  const cards = useMemo(() => {
    const isArchived = (project: FolderState['projects'][number]) => !!archives.ofProject(project.addr)
    const toCard = (project: FolderState['projects'][number]): ProjectCardProps => {
      // An issue archived with its project is still that project's to count; one archived on its own is not.
      const issues = state.issues.filter((issue) => {
        const archive = archives.ofIssue(issue)
        return issue.projectAddr === project.addr && (!archive || !!archive.with)
      })
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
        archived: isArchived(project),
      }
    }
    return {
      active: state.projects.filter((p) => !isArchived(p)).map(toCard),
      archived: state.projects.filter(isArchived).map(toCard),
    }
  }, [state, directory, archives])

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
            if (result.unlisted) say(`Project created, but not listed in its Folder, so Peek will not show it there — ${result.unlisted}`, 'error')
            else say('Project created')
            return true
          }}
        />
      )}
    </>
  )
}
