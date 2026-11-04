import type { FolderState } from '@/api'
import type { Person } from '@/api/useDirectory'
import { ISSUE_STATUSES, lookupStatus, progressOf, projectStatus } from '@/nostr/kinds'
import { href, type ProjectsTab } from '@/router'
import type { Archives } from './archive'
import { placedIn } from './placement'

/** One project on Ship's Projects (SHIPS-7), as the approved story draws it in a row or on a card. */
export interface ProjectRowData {
  addr: string
  href: string
  title: string
  /** The Folder it is in, on the whole workspace's list; absent on a Folder's own. */
  folder?: string
  status: { value: string; label: string }
  /** Who leads it; absent when nobody does. */
  lead?: Person
  /** Its issues done of all but the cancelled ones; an issue archived on its own is not its to count (FOL-46). */
  progress: { done: number; total: number }
  archived: boolean
}

/** The status tab a project not archived sits on, by what its status means; a cancelled one is only under All. */
const TAB_OF_STAGE = { open: 'planned', started: 'active', done: 'completed' } as const

/**
 * Every tab's projects, by title. Archived is FOL-46's (a project archived itself or with its team) and only that
 * tab holds one; All is every project not archived. `folders` names each project's Folder, and is left out on a
 * Folder's own list, which `projects` already is.
 */
export function projectTabs(
  projects: FolderState['projects'],
  issues: FolderState['issues'],
  archives: Archives,
  personOf: (pubkey: string) => Person,
  folders?: readonly { id: string; name?: string; addresses?: readonly string[] }[],
): Record<ProjectsTab, ProjectRowData[]> {
  const tabs: Record<ProjectsTab, ProjectRowData[]> = { all: [], planned: [], active: [], completed: [], archived: [] }
  // Each project's issues, read once: one archived with its project is still that project's to count, one archived on its own is not.
  const issuesOf = new Map<string, string[]>()
  for (const issue of issues) {
    const archive = archives.ofIssue(issue)
    if (!issue.projectAddr || (archive && !archive.with)) continue
    issuesOf.set(issue.projectAddr, [...(issuesOf.get(issue.projectAddr) ?? []), issue.status])
  }
  const byTitle = [...projects].sort((a, b) => a.title.localeCompare(b.title))
  for (const project of byTitle) {
    const status = projectStatus(project.status)
    const archived = !!archives.ofProject(project.addr)
    const row: ProjectRowData = {
      addr: project.addr,
      href: href({ name: 'project', d: project.id, slug: project.title, view: 'table' }),
      title: project.title,
      ...(folders ? { folder: placedIn({ addr: project.addr, folder: project.contentFolder }, folders)[0]?.name } : {}),
      status: { value: status.value, label: status.label },
      ...(project.lead ? { lead: personOf(project.lead) } : {}),
      progress: progressOf(issuesOf.get(project.addr) ?? [], (value) => lookupStatus(ISSUE_STATUSES, value)),
      archived,
    }
    if (archived) {
      tabs.archived.push(row)
      continue
    }
    tabs.all.push(row)
    const tab = status.stage && status.stage !== 'dropped' ? TAB_OF_STAGE[status.stage] : undefined
    if (tab) tabs[tab].push(row)
  }
  return tabs
}
