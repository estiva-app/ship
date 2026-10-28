import { createContext, useContext, useEffect, useMemo } from 'react'
import { holdsThreads, type ThreadsWanted, type WorkspaceState } from '../nostr/store'

/** The workspace's `wantThreads` (APP-5), for the screen on display. Absent where nothing reads lazily — a story, a test. */
export const ThreadsContext = createContext<((wanted: ThreadsWanted) => void) | null>(null)

const NONE: ThreadsWanted = { folders: [], about: [] }

/**
 * Ask for the conversations a screen draws — the Folders it shows, and the
 * files whose Mentioned in it lists — and say whether `state` holds them yet
 * (APP-5): `folders` once the Folders' conversations are held, `all` once the
 * mentions are too. Until then the screen draws them as loading, never as
 * empty, a list draws no counts (Katerina, 28 Oct: nothing while they are on
 * the way), and nothing is marked read. Asked again when `state` changes, so a
 * read the relay refused is asked again with the next one.
 */
export function useThreads(state: WorkspaceState | null | undefined, folders: readonly string[], about: readonly string[] = []): { folders: boolean; all: boolean } {
  const want = useContext(ThreadsContext)
  const key = `${[...new Set(folders)].sort().join(' ')}|${[...new Set(about)].sort().join(' ')}`
  // One object per key, so the workspace can tell a screen drawing again from a new ask.
  const wanted = useMemo<ThreadsWanted>(() => {
    const [f, a] = key.split('|')
    return { folders: f ? f.split(' ') : [], about: a ? a.split(' ') : [] }
  }, [key])
  useEffect(() => {
    if (!want || !state) return
    want(wanted)
    // A screen that draws no conversations has none read for it with every poll.
    return () => want(NONE)
  }, [want, wanted, state])
  if (!want || !state) return { folders: true, all: true }
  // The opened page's own read holds its Folders, not yet its mentions (APP-4): its conversation draws at once.
  return { folders: holdsThreads(state, { folders: wanted.folders, about: [] }), all: holdsThreads(state, wanted) }
}
