import type { ProjectRowData } from '@/lib/projects'
import type { ProjectsTab } from '@/router'
import type { HistoryEntry } from '@/components/History'
import { ANA, MARA, RAVI } from './issues'

/** Invented projects — nothing real. */
const NOW = Math.floor(Date.now() / 1000)

export const PROJECT_STATUSES = [
  { value: 'planned', label: 'Planned', colour: 'neutral' as const },
  { value: 'in_progress', label: 'In Progress', colour: 'blue' as const },
  { value: 'completed', label: 'Completed', colour: 'green' as const },
  { value: 'cancelled', label: 'Cancelled', colour: 'muted' as const },
]

const IN_PROGRESS = { value: 'in_progress', label: 'In Progress' }
const PLANNED = { value: 'planned', label: 'Planned' }
const COMPLETED = { value: 'completed', label: 'Completed' }
const row = (d: string, title: string, folder: string, status: ProjectRowData['status'], done: number, total: number, extra: Partial<ProjectRowData> = {}): ProjectRowData => ({
  addr: `30850:a:${d}`,
  href: `#/project/30850%3Aa%3A${d}`,
  title,
  folder,
  status,
  progress: { done, total },
  archived: false,
  ...extra,
})

const ACTIVE_ROWS = [
  row('des', 'Design System', 'Product', IN_PROGRESS, 2, 11, { lead: ANA }),
  row('rel', 'Relay Migration, every workspace read and write moved onto the relay one surface at a time', 'Engineering', IN_PROGRESS, 2, 9, { lead: RAVI }),
  row('sea', 'Search', 'Engineering', IN_PROGRESS, 0, 0),
]
const PLANNED_ROWS = [
  row('pay', 'Payment integration', 'Engineering', PLANNED, 1, 11, { lead: RAVI }),
  row('onb', 'Onboarding flow for new workspaces', 'Product', PLANNED, 0, 6, { lead: MARA }),
  // A lead nobody has published a profile for: a face with no name, never a key.
  row('mob', 'Mobile app', 'Product', PLANNED, 0, 0, { lead: {} }),
]
const COMPLETED_ROWS = [row('doc', 'Docs site', 'Product', COMPLETED, 5, 5, { lead: ANA })]

/** Projects' tabs as `projectTabs` hands them over, every branch drawn: a lead or none, no issues, a long name. */
export const PROJECT_TABS: Record<ProjectsTab, ProjectRowData[]> = {
  all: [...ACTIVE_ROWS, ...COMPLETED_ROWS, ...PLANNED_ROWS].sort((a, b) => a.title.localeCompare(b.title)),
  planned: PLANNED_ROWS,
  active: ACTIVE_ROWS,
  completed: COMPLETED_ROWS,
  archived: [row('web', 'Website refresh', 'Product', COMPLETED, 6, 6, { lead: RAVI, archived: true })],
}

export const SIDEBAR_PROJECTS: { addr: string; title: string; href: string; openCount: number }[] = [
  { addr: '30850:a:des', title: 'Design System', href: '#/project/30850%3Aa%3Ades', openCount: 9 },
  { addr: '30850:a:rel', title: 'Relay Migration', href: '#/project/30850%3Aa%3Arel', openCount: 6 },
  { addr: '30850:a:pay', title: 'Payment integration', href: '#/project/30850%3Aa%3Apay', openCount: 3 },
  { addr: '30850:a:onb', title: 'Onboarding flow for new workspaces', href: '#/project/30850%3Aa%3Aonb', openCount: 0 },
  { addr: '30850:a:mob', title: 'Mobile app', href: '#/project/30850%3Aa%3Amob', openCount: 0 },
]

export const PEOPLE = [
  { value: 'ana', name: ANA.name, picture: ANA.picture },
  { value: 'ravi', name: RAVI.name, picture: RAVI.picture },
  { value: 'mara', name: MARA.name, picture: MARA.picture },
]

/** What the fold's change stream says about one issue, already in words. */
export const ACTIVITY: HistoryEntry[] = [
  { id: 'c1', by: ANA, at: NOW - 86400 * 2, text: 'opened the issue' },
  { id: 'c2', by: RAVI, at: NOW - 86400, text: 'set status to In Progress' },
  { id: 'c3', by: RAVI, at: NOW - 86400, text: 'assigned Ana Duarte' },
  { id: 'c4', by: ANA, at: NOW - 3600 * 2, text: 'renamed it from "Board loses order" to "Board columns lose order after an archived project returns"' },
]
