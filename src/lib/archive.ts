/**
 * What is archived in this workspace, and what is archived with it — FOL-46.
 *
 * **One field for every file.** A project, an issue and a Folder are each
 * archived by a change setting `archived` on its address, and restored by an
 * empty value; the change's note is the resolution the person gave. Ship's fold
 * already carries the winning value in `fields.archived`, and the activity list
 * holds the change it came from, which is where the note is.
 *
 * **The cascade is read, never written.** An issue is archived with its
 * project; a project is archived with its team when every team that lists it
 * is archived. Nothing is published to the children, so unarchiving the parent
 * restores exactly what was there — the rule interop applies to every app's
 * Folder listing, drawn here from Ship's own fold.
 *
 * Generic over the shapes it reads, so this file knows no kinds.
 */

/** Ship wrote this note on every archive before FOL-46; it is not a resolution. */
const PLACEHOLDER_NOTE = 'archived'

/** An archive, as a page draws it. */
export interface ArchiveState {
  /** Who archived it — the parent's archiver when it is archived `with` one. */
  by: string
  /** When, in seconds. */
  at: number
  resolution?: string
  /** Present when the file is hidden only because this parent is archived. `id` is a Folder's, for its page. */
  with?: { kind: 'project' | 'folder'; addr: string; title: string; id?: string }
}

interface Archivable {
  addr: string
  fields: Record<string, { value: string; by: string; at: number }>
}

interface ChangeLike {
  target: string
  field: string
  value: string
  note: string
}

interface FolderLike {
  id: string
  name?: string
  channel?: string
  addresses?: readonly string[]
  archived?: { by: string; at: number; resolution?: string }
}

/** The file's own archive, if the winning `archived` change archived it. */
export function ownArchive(file: Archivable, activity: readonly ChangeLike[]): ArchiveState | undefined {
  const winner = file.fields.archived
  // Any non-empty value, as Ship's fold has always read a project's.
  if (!winner?.value) return undefined
  // The activity list is in the order the fold replays, so the last change to
  // this field is the one that won, and its note is the resolution.
  const change = activity.findLast((c) => c.target === file.addr && c.field === 'archived')
  const note = change?.note.trim()
  return {
    by: winner.by,
    at: winner.at,
    ...(note && note !== PLACEHOLDER_NOTE ? { resolution: change!.note } : {}),
  }
}

/**
 * Why an archived file's own fields cannot change: its title, description and
 * rail stay shut until it is unarchived, while Archive and Delete stay open
 * (Miky, SHI-36). Ship's courtesy, not the relay's rule — the relay does not
 * know an archive and accepts the write from any other app.
 */
export function lockedReason(archive: ArchiveState | undefined): string | undefined {
  if (!archive) return undefined
  if (archive.with?.kind === 'project') return 'Unarchive its project to edit'
  if (archive.with?.kind === 'folder') return 'Unarchive its Folder to edit'
  return 'Unarchive to edit'
}

/**
 * The line in the comment box's place on an archived file: it takes no new
 * comment or reaction, in every app (Miky, 2026-10-17, reversing SHI-36's
 * "comments stay open"). Ship's courtesy, as above.
 */
export function archivedLine(archive: ArchiveState | undefined): string | undefined {
  if (!archive) return undefined
  if (archive.with?.kind === 'project') return 'Archived with its project. Unarchive the project to comment.'
  if (archive.with?.kind === 'folder') return 'Archived with its Folder. Unarchive the Folder to comment.'
  return 'Archived. Unarchive it to comment.'
}

export interface Archives {
  /** The project's archive: its own, or its team's when every team listing it is archived. */
  ofProject: (addr: string) => ArchiveState | undefined
  /** The issue's archive: its own, or its project's. */
  ofIssue: (issue: { addr: string }) => ArchiveState | undefined
}

/**
 * Every archive in the workspace, and the cascade.
 *
 * `folders` is the whole listing (`useFolders`), archived Folders included —
 * `topLevelFolders` has already left those out, and without them a project in
 * an archived team would look like one in no team at all.
 */
export function archivesOf(
  state: {
    projects: readonly (Archivable & { title: string; contentFolder?: string })[]
    issues: readonly (Archivable & { projectAddr?: string })[]
    activity: readonly ChangeLike[]
  },
  folders: readonly FolderLike[] = [],
): Archives {
  const projects = new Map<string, ArchiveState | undefined>()
  for (const project of state.projects) {
    const own = ownArchive(project, state.activity)
    if (own) {
      projects.set(project.addr, own)
      continue
    }
    // Placed as the sidebar places it: by the states that list it, then by its own Folder.
    const listing = folders.filter((folder) => folder.addresses?.includes(project.addr))
    const placed = listing.length ? listing : folders.filter((folder) => folder.id === project.contentFolder)
    const archivedTeam = placed.length && placed.every((folder) => folder.archived) ? placed[0] : undefined
    projects.set(
      project.addr,
      archivedTeam?.archived
        ? {
            ...archivedTeam.archived,
            with: { kind: 'folder', addr: archivedTeam.channel ?? archivedTeam.id, id: archivedTeam.id, title: archivedTeam.name ?? 'Untitled Folder' },
          }
        : undefined,
    )
  }
  const titleOf = new Map(state.projects.map((project) => [project.addr, project.title]))
  const issues = new Map<string, ArchiveState | undefined>()
  for (const issue of state.issues) {
    const own = ownArchive(issue, state.activity)
    const project = issue.projectAddr ? projects.get(issue.projectAddr) : undefined
    issues.set(
      issue.addr,
      own ??
        (project && issue.projectAddr
          ? { ...project, with: { kind: 'project', addr: issue.projectAddr, title: titleOf.get(issue.projectAddr) ?? 'its project' } }
          : undefined),
    )
  }
  return {
    ofProject: (addr) => projects.get(addr),
    ofIssue: (issue) => issues.get(issue.addr),
  }
}
