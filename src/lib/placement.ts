/**
 * Which top-level Folders a project is in — the rule the sidebar places it by
 * and the project rail names (FOL-5, FOL-3), kept in one place so the two
 * cannot disagree.
 *
 * The Folders whose state lists its address, which is what Peek's Folders
 * column draws it under. Failing that, its own Folder if that is one of them:
 * a project created a moment ago, before the listing is read again. Empty when
 * it is in none. Usually one; a project two states list is under both.
 */
export function placedIn<F extends { id: string; addresses?: readonly string[] }>(
  project: { addr: string; folder?: string },
  folders: readonly F[],
): F[] {
  const listing = folders.filter((folder) => folder.addresses?.includes(project.addr))
  if (listing.length > 0) return listing
  const own = project.folder ? folders.find((folder) => folder.id === project.folder) : undefined
  return own ? [own] : []
}
