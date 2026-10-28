import { createContext, useContext, useEffect, useMemo } from 'react'
import { holdsThreads, type ThreadsWanted, type WorkspaceState } from '../nostr/store'

/** The workspace's `wantThreads` (APP-5), for the screen on display. Absent where nothing reads lazily — a story, a test. */
export const ThreadsContext = createContext<((wanted: ThreadsWanted) => void) | null>(null)

const NONE: ThreadsWanted = { folders: [], about: [] }

/**
 * Ask for the conversations a screen draws — the Folders it shows, and the
 * files whose Mentioned in it lists — and say whether `state` holds them yet
 * (APP-5). Until it does, the screen draws its conversations as loading, never
 * as empty, and a list draws no counts (Katerina, 28 Oct: nothing while they
 * are on the way). Asked again when `state` changes, so a read the relay
 * refused is asked again with the next one.
 */
export function useThreads(state: WorkspaceState | null | undefined, folders: readonly string[], about: readonly string[] = []): boolean {
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
  return !want || !state || holdsThreads(state, wanted)
}
