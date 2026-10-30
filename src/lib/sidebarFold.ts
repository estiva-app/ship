/**
 * Whether Ship's sidebar is shown (SHI-54), as Leaf's is (LED-3): folded from
 * the top bar's menu button, and folded stays folded on this browser, across
 * pages and reloads, until unfolded. Where it is kept is the app's (ui 0.90).
 */
import { useCallback, useState } from 'react'
import { parse } from '@/router'

const KEY = 'ship.sidebarFolded'

function folded(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The pages that are a file: a project, an issue, another app's file, or a reference still resolving to one. */
const FILE_PAGES = new Set(['project', 'issue', 'inbound', 'elsewhere'])

/**
 * A file opened from a link — another app's card, a link in a message — shows
 * where it lives, so a folded sidebar unfolds for it, as its button would, and
 * stays unfolded (Katerina, 30 October; until then folded stayed folded across
 * pages). Not on a reload, which keeps the sidebar as the person left it, nor
 * on a list.
 */
function arrivedAtAFile(): boolean {
  if (!FILE_PAGES.has(parse(`${location.pathname}${location.search}${location.hash}`).name)) return false
  const [entry] = (typeof performance.getEntriesByType === 'function' ? performance.getEntriesByType('navigation') : []) as PerformanceNavigationTiming[]
  return entry?.type !== 'reload'
}

/** Open or folded, and the setter that remembers it. */
export function useSidebarFold(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    if (!folded()) return true
    if (!arrivedAtAFile()) return false
    try {
      window.localStorage.removeItem(KEY)
    } catch {
      // Storage refused: it unfolds for this visit only.
    }
    return true
  })
  const change = useCallback((next: boolean) => {
    setOpen(next)
    try {
      if (next) window.localStorage.removeItem(KEY)
      else window.localStorage.setItem(KEY, '1')
    } catch {
      // Storage refused (private mode, full): it folds for this visit only.
    }
  }, [])
  return [open, change]
}
