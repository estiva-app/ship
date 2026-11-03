/**
 * Whether Ship's sidebar is shown (SHI-54), as Leaf's and Peek's are: the package's `useSidebarFold` since ui 0.99.0
 * (Katerina, 31 October: one fold in every app), which draws the button, folds with Peek's motion, keeps a folded
 * sidebar folded on this browser, and unfolds it for a file opened from a link. What is Ship's: its key, and which
 * of its pages are a file.
 */
import { useSidebarFold as useFold } from '@estiva-app/ui'
import { parse } from '@/router'

/** The pages that are a file: a project, an issue, another app's file, or a reference still resolving to one. */
const FILE_PAGES = new Set(['project', 'issue', 'inbound', 'elsewhere'])

/** Whether the page open now is a file, which a link may have opened: a folded sidebar unfolds for it (Katerina, 30 October), a list keeps it folded. */
export function isFilePage(): boolean {
  return FILE_PAGES.has(parse(`${location.pathname}${location.search}${location.hash}`).name)
}

/** Open or folded, and the setter that remembers it. */
export function useSidebarFold(): [boolean, (open: boolean) => void] {
  return useFold({ storageKey: 'ship.sidebarFolded', isFile: isFilePage })
}
