/**
 * Whether Ship's sidebar is shown (SHI-54), as Leaf's is (LED-3): folded from
 * the top bar's menu button, and folded stays folded on this browser, across
 * pages and reloads, until unfolded. Where it is kept is the app's (ui 0.90).
 */
import { useCallback, useState } from 'react'

const KEY = 'ship.sidebarFolded'

function folded(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Open or folded, and the setter that remembers it. */
export function useSidebarFold(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => !folded())
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
