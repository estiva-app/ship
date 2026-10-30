import { useEffect } from 'react'
import type { WorkspaceState } from '@/api'
import type { Route } from '@/router'

/**
 * The browser tab's title: the page first, then the app, so a narrow tab
 * still shows which page it is (SFX-2; Miky, 2026-10-30). A page whose object
 * is loading or unreadable is just "Ship" — never the previous page's title.
 */
export function tabTitle(page: string | undefined): string {
  return page ? `${page} – Ship` : 'Ship'
}

/**
 * What the route's page is called, as its heading says; undefined until it is known. `null` for a Folder, which
 * names itself from its own read (`FolderPage`): the sidebar's listing is read once a tab, so a rename made in Peek
 * would leave the tab on the old name.
 */
export function pageTitleOf(route: Route, state: WorkspaceState | null): string | undefined | null {
  switch (route.name) {
    case 'issues':
      return 'Issues'
    case 'projects':
      return 'Projects'
    case 'project':
      return state?.projects.find((project) => project.id === route.d)?.title || undefined
    case 'issue': {
      const issue = state?.issues.find((candidate) => candidate.id === route.d)
      if (!issue?.title) return undefined
      // The ref is what you search your tabs by (SFX-2 kickoff).
      return issue.ref ? `${issue.ref} ${issue.title}` : issue.title
    }
    case 'folder':
      return null
    default:
      return undefined
  }
}

/** Sets the tab's title; `null` leaves it to the page, which calls this itself. */
export function useTabTitle(page: string | undefined | null): void {
  useEffect(() => {
    if (page !== null) document.title = tabTitle(page)
  }, [page])
}
