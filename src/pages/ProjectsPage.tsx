import { useMemo, useState } from 'react'
import { createProject, keyProblem, me, projectKeys, setProjectDeleted, suggestKey, takenKeys, type DirectoryView, type FolderState } from '@/api'
import { day } from '@/lib/time'
import type { FolderSummary } from '@estiva-app/interop'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { ProjectsView, type ProjectsLayout } from '@/views/ProjectsView'
import type { Archives } from '@/lib/archive'
import { projectTabs } from '@/lib/projects'
import { go, href, type ProjectsTab } from '../router'
import { act, type Say } from './act'
import { useReopenHeld } from '@/auth/heldTyping'
import { folderName, projectsIn } from '@/lib/placement'

/** Where the New project dialog holds its fields through a passkey trip (AUT-4). */
const NEW_PROJECT_HOLD = 'new-project'

/** The table or the cards, as this device last chose (SHIPS-7). */
const LAYOUT_KEY = 'ship.projects-layout'

function storedLayout(): ProjectsLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'cards' ? 'cards' : 'table'
  } catch {
    return 'table'
  }
}

/**
 * The projects list from the fold, in tabs by what each status means (SHIPS-7): the route's tab, Active when it
 * names none, as a table or cards. Nothing here recomputes what the fold decided — `archived`, `status` and `lead`
 * are read off the folded project. "Add project" opens the form in a dialog; a created project is on screen only
 * once the relay has been read again.
 *
 * Archived is FOL-46's (`archivesOf`): a project archived itself or with its team is on the Archived tab, and a
 * project counts only the issues not archived on their own.
 */
export function ProjectsPage({ state, directory, teams, archives, tab, folder, say, refresh }: { state: FolderState; directory: DirectoryView; teams: FolderSummary[] | undefined; archives: Archives; tab: ProjectsTab; folder?: string; say: Say; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [layout, setLayout] = useState<ProjectsLayout>(storedLayout)
  const chooseLayout = (next: ProjectsLayout) => {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // A device that keeps nothing still switches; it opens on the table next time.
    }
  }
  useReopenHeld(NEW_PROJECT_HOLD, () => setAdding(true))
  // Derived once per read, not per keystroke in the Add project dialog (SHI-4).
  const keys = useMemo(() => {
    const byProject = projectKeys(state.projects, state.issues)
    return { byProject, taken: takenKeys(state.projects, state.issues, byProject) }
  }, [state.projects, state.issues])

  const { lists, deleted } = useMemo(() => {
    // A Folder's Projects lists only the projects in that team (SHIPS-5), by the sidebar's own rule, and names no Folder.
    const here = folder ? projectsIn(state.projects, teams ?? [], folder) : state.projects
    // A deleted project leaves every tab for the Archived tab's Deleted filter (SPEC §6.5).
    const live = here.filter((p) => !p.deleted)
    return {
      lists: folder ? projectTabs(live, state.issues, archives, directory.personOf) : projectTabs(live, state.issues, archives, directory.personOf, teams ?? []),
      deleted: here.flatMap((project) =>
        project.deleted
          ? [
              {
                href: href({ name: 'project', d: project.id, slug: project.title, view: 'table' }),
                title: project.title,
                deleted: `Deleted by ${project.deleted.by === me ? 'you' : directory.nameOf(project.deleted.by)} · ${day(project.deleted.at)}`,
                onRestore: () =>
                  act('Restore', () => setProjectDeleted(project, false), say, refresh).then((ok) => {
                    if (ok) say('Project restored')
                  }),
              },
            ]
          : [],
      ),
    }
  }, [state, directory, archives, folder, teams, say, refresh])

  return (
    <>
      <ProjectsView
        title={folder ? `${folderName(teams, folder)} · Projects` : 'Projects'}
        lists={lists}
        deleted={deleted}
        tab={tab}
        onTab={(next) => go({ name: 'projects', tab: next, folder })}
        layout={layout}
        onLayout={chooseLayout}
        showFolder={!folder}
        onAddProject={() => setAdding(true)}
      />
      {adding && (
        <NewProjectDialog
          teams={teams?.map((team) => ({ id: team.id, name: team.name ?? 'Untitled team', hasState: team.hasState }))}
          team={folder}
          suggestKey={(title) => suggestKey(title, keys.taken)}
          keyProblem={(key) => keyProblem(key, state.projects, state.issues, keys.byProject)}
          holdKey={NEW_PROJECT_HOLD}
          onClose={() => setAdding(false)}
          onCreate={async (draft) => {
            const result = await createProject(draft)
            if (!result.ok) {
              say(`Project rejected — ${result.reason}`, 'error')
              return false
            }
            await refresh()
            // A new project is Planned: show it where it now is, not on a tab it is missing from.
            if (tab !== 'all' && tab !== 'planned') go({ name: 'projects', tab: 'planned', folder })
            if (result.unlisted) say(`Project created, but not listed in its team, so Peek will not show it there — ${result.unlisted}`, 'error')
            else say('Project created')
            return true
          }}
        />
      )}
    </>
  )
}
