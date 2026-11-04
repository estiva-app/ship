import { moveProject, type Project } from '@/api'
import { reloadFolders } from '@/api/useFolders'
import { MoveProjectDialog, type MoveProjectFolder } from '@/components/MoveProjectDialog'
import { placedIn } from '@/lib/placement'
import { act, type Say } from '@/pages/act'

/**
 * "Move to Folder…", from the project page's ⋯ or a sidebar row (FOL-7): the
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
  teams: readonly { id: string; name?: string; hasState: boolean; private?: boolean; addresses?: readonly string[] }[]
  say: Say
  onClose: () => void
}) {
  const folders: MoveProjectFolder[] = teams.map((team) => ({ id: team.id, name: team.name ?? 'Untitled team', hasState: team.hasState, ...(team.private ? { private: true } : {}) }))
  const here = new Set(placedIn({ addr: project.addr, folder: project.contentFolder }, teams).map((team) => team.id))
  const current = folders.filter((folder) => here.has(folder.id))
  // What each one's state lists, as read: its own Folder, where `placedIn` puts a project no Folder lists, may hold none of
  // it, and `moveProject` then places it rather than moving it out of a Folder that does not list it.
  const sources = teams.filter((team) => here.has(team.id)).map((team) => ({ id: team.id, hasState: team.hasState, addresses: team.addresses }))
  const nameOf = (id: string) => folders.find((folder) => folder.id === id)?.name ?? 'Untitled team'

  return (
    <MoveProjectDialog
      title={project.title}
      current={current}
      folders={folders}
      onClose={onClose}
      onMove={async (to) => {
        let stillIn: { folder: string; why?: string } | undefined
        let changed = false
        const ok = await act(
          'Move',
          async () => {
            const result = await moveProject(project, sources, to)
            if (result.ok) stillIn = result.stillIn
            else changed = !!result.changed
            return result
          },
          say,
          reloadFolders,
          // Already Ship's sentence: "Nothing was moved: …".
          (reason) => reason,
        )
        if (!ok) {
          // A list changed since it was read: read the Folders again, so Move tries from where it is now.
          if (changed) await reloadFolders()
          return false
        }
        if (stillIn) {
          // Only the Folder whose move was refused is named; any after it were never asked.
          say(`Moved to ${to.name}, but ${nameOf(stillIn.folder)} still lists it too${stillIn.why ? `: ${stillIn.why}` : '. Try moving it again.'}`, 'error')
          return false
        }
        say(`Moved to ${to.name}`)
        return true
      }}
    />
  )
}
