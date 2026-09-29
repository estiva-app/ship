import { moveProject, type Project } from '@/api'
import { reloadFolders } from '@/api/useFolders'
import { MoveProjectDialog, type MoveProjectFolder } from '@/components/MoveProjectDialog'
import { placedIn } from '@/lib/placement'
import { act, type Say } from '@/pages/act'

/**
 * "Move to Folder…", from the project rail or a sidebar row (FOL-7): the
 * dialog, the write, and what is said after it.
 *
 * **Where it is now is the sidebar's rule** (`placedIn`), so the Folders it is
 * taken out of are the ones the person sees it under. `teams` is the live
 * listing, so after a move that half-worked the dialog — still open — shows
 * both Folders, and Move again is the retry.
 *
 * **Only the Folder listing is read again.** A move changes two `kind:30890`
 * states and nothing in the fold, so a workspace re-read would spend a
 * request per Folder to learn nothing (`act`'s note on reactions).
 */
export function MoveProject({
  project,
  teams,
  say,
  onClose,
}: {
  project: Project
  teams: readonly { id: string; name?: string; hasState: boolean; addresses?: readonly string[] }[]
  say: Say
  onClose: () => void
}) {
  const folders: MoveProjectFolder[] = teams.map((team) => ({ id: team.id, name: team.name ?? 'Untitled Folder', hasState: team.hasState }))
  const here = new Set(placedIn({ addr: project.addr, folder: project.contentFolder }, teams).map((team) => team.id))
  const current = folders.filter((folder) => here.has(folder.id))
  const nameOf = (id: string) => folders.find((folder) => folder.id === id)?.name ?? 'Untitled Folder'

  return (
    <MoveProjectDialog
      title={project.title}
      current={current}
      folders={folders}
      onClose={onClose}
      onMove={async (to) => {
        let stillIn: { folder: string; reason: string }[] | undefined
        const ok = await act(
          'Move',
          async () => {
            const result = await moveProject(project, current, to)
            if (result.ok) stillIn = result.stillIn
            return result
          },
          say,
          reloadFolders,
        )
        if (!ok) return false
        if (stillIn) {
          const names = stillIn.map(({ folder }) => nameOf(folder)).join(' and ')
          say(`Moved to ${to.name}, but ${names} refused to let it go, so it is listed in both — ${stillIn[0].reason}. Press Move to try again.`, 'error')
          return false
        }
        say(`Moved to ${to.name}`)
        return true
      }}
    />
  )
}
