import type { ProjectCardProps } from '@/components/ProjectCard'
import type { HistoryEntry } from '@/components/History'
import type { SidebarProject } from '@/components/ShipSidebar'
import { ANA, MARA, RAVI } from './issues'

/** Invented projects — nothing real. */
const NOW = Math.floor(Date.now() / 1000)

export const PROJECT_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const PROJECT_CARDS: ProjectCardProps[] = [
  {
    href: '#/project/30850%3Aa%3Ades',
    title: 'Design System',
    description: 'Tokens, primitives and the Storybook that reviews them.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 11,
    doneCount: 2,
    author: ANA,
    createdAt: NOW - 86400,
  },
  {
    href: '#/project/30850%3Aa%3Arel',
    title: 'Relay Migration',
    description: 'Moving every workspace read and write onto the relay, one surface at a time, with the old path kept until each is proven.',
    status: { value: 'in_progress', label: 'In Progress' },
    issueCount: 9,
    doneCount: 2,
    author: RAVI,
    createdAt: NOW - 86400 * 2,
  },
  {
    href: '#/project/30850%3Aa%3Apay',
    title: 'Payment integration',
    description: 'Take card payments.',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 11,
    doneCount: 1,
    author: RAVI,
    createdAt: NOW - 86400 * 2,
  },
  {
    href: '#/project/30850%3Aa%3Aonb',
    title: 'Onboarding flow for new workspaces',
    description: 'The first ten minutes, from an invite to a first issue.',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 6,
    doneCount: 0,
    author: ANA,
    createdAt: NOW - 3600 * 5,
  },
  {
    href: '#/project/30850%3Aa%3Amob',
    title: 'Mobile app',
    status: { value: 'planned', label: 'Planned' },
    issueCount: 0,
    doneCount: 0,
    author: {},
    createdAt: NOW - 120,
  },
]

export const ARCHIVED_CARDS: ProjectCardProps[] = [
  {
    href: '#/project/30850%3Aa%3Aweb',
    title: 'Website refresh',
    description: 'The marketing site on the new tokens.',
    status: { value: 'completed', label: 'Completed' },
    issueCount: 6,
    doneCount: 6,
    author: RAVI,
    createdAt: NOW - 86400 * 40,
    archived: true,
  },
]

export const SIDEBAR_PROJECTS: SidebarProject[] = [
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
