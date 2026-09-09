import type { IssueRowData } from '@/components/IssueRow'
import type { IssuesTableRow } from '@/components/IssuesTable'
import type { ThreadData } from '@/components/ConversationThread'
import type { ActivityItem } from '@/components/Activity'
import anaPortrait from './avatars/ana-duarte.png'
import raviPortrait from './avatars/ravi-mehta.png'
import maraPortrait from './avatars/mara-sato.png'

/**
 * Invented data for stories and tests — nothing real. Ship's own fictional
 * personas (Ana, Ravi — from scripts/verify.ts) and made-up projects.
 * Statuses are production's vocabulary; one is deliberately unknown.
 */
const NOW = Math.floor(Date.now() / 1000)

/** Portraits: Peek's own fictional demo faces (peek/src/assets/avatars), so the two apps share invented people. */
export const ANA = { name: 'Ana Duarte', picture: anaPortrait }
export const RAVI = { name: 'Ravi Mehta', picture: raviPortrait }
export const MARA = { name: 'Mara Sato', picture: maraPortrait }
export const NOBODY = {}

/** The parent, as a row's chip names it. Row 8 has none — a parentless issue (B10). */
export const REL = { title: 'Relay Migration', href: '#/p/rel' }

export const ISSUE_STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const ISSUES: IssuesTableRow[] = [
  { addr: '30851:a:1', id: '1', ref: 'REL-1', project: REL, title: 'Board columns lose order after an archived project returns', status: 'in_progress', assignee: ANA, openedBy: RAVI, at: NOW - 3600 * 2, conversations: 2 },
  { addr: '30851:a:2', id: '2', ref: 'REL-2', project: REL, title: 'Comments lose their draft when navigating away', status: 'in_progress', assignee: RAVI, openedBy: ANA, at: NOW - 86400 },
  { addr: '30851:a:3', id: '3', ref: 'REL-3', project: REL, title: 'Pick the dark theme accent', status: 'todo', assignee: MARA, openedBy: ANA, at: NOW - 86400 * 2, conversations: 1 },
  { addr: '30851:a:4', id: '4', ref: 'REL-4', project: REL, title: 'Add a keyboard path for changing status from the list', status: 'todo', assignee: ANA, openedBy: RAVI, at: NOW - 86400 * 3 },
  { addr: '30851:a:5', id: '5', project: REL, title: 'Filed from another app, with no ref', status: 'todo', openedBy: NOBODY, at: NOW - 86400 * 4 },
  { addr: '30851:a:6', id: '6', ref: 'REL-6', project: REL, title: 'Empty states read as broken screens', status: 'done', assignee: RAVI, openedBy: ANA, at: NOW - 86400 * 9 },
  { addr: '30851:a:7', id: '7', ref: 'REL-7', project: REL, title: 'Relay refuses events from a clock ten minutes out', status: 'done', assignee: ANA, openedBy: ANA, at: NOW - 86400 * 12 },
  { addr: '30851:a:8', id: '8', ref: 'REL-8', title: 'Duplicate project cards after a re-seed', status: 'cancelled', openedBy: RAVI, at: NOW - 86400 * 20 },
  { addr: '30851:a:9', id: '9', ref: 'REL-9', project: REL, title: 'A status Ship has no word for', status: 'blocked', assignee: RAVI, openedBy: ANA, at: NOW - 3600 * 5 },
]

export const ROWS: IssueRowData[] = ISSUES

export const hrefFor = (issue: IssueRowData) => `#/issue/${encodeURIComponent(issue.addr)}`

export const THREADS: ThreadData[] = [
  {
    id: 't1',
    root: { id: 'm1', author: ANA, at: NOW - 3600 * 3, body: 'The board keeps the columns in vocabulary order after a reload, but not after an archived project comes back. Anyone else seeing this?' },
    replies: [
      { id: 'm2', author: RAVI, at: NOW - 3600 * 2, body: 'Yes — it re-reads the folder union and the archived one lands last.' },
      { id: 'm3', author: MARA, at: NOW - 3600, body: 'Same here, from Peek.' },
    ],
  },
  {
    id: 't2',
    root: { id: 'm4', author: RAVI, at: NOW - 86400, body: 'Moving this to in progress.\nWill pair with Ana on the fix tomorrow.' },
    replies: [],
  },
]

/**
 * Activity — conversations on files *related* to the one being read (CON-9).
 *
 * Deliberately mixed. A mention is a thread that named this object in passing,
 * on a file that has nothing else to do with it; a sub-file's thread is the
 * project's own subtree. The two are drawn with different weight, so a fixture
 * showing only one of them would review only half the component.
 *
 * The mention here is §5.1's case: four messages of unrelated discussion, the
 * reference arriving last.
 */
export const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    relation: 'sub-file',
    where: 'REL-4 · Fold the change stream once per read',
    thread: {
      id: 'a1',
      root: { id: 'am1', author: RAVI, at: NOW - 1800, body: 'Down to one fold per read. The second pass was the re-linked project.' },
      replies: [{ id: 'am2', author: ANA, at: NOW - 900, body: 'Nice. Does the widening still terminate on a chain of four?' }],
    },
  },
  {
    relation: 'mention',
    where: 'Design System',
    thread: {
      id: 'a2',
      root: { id: 'am3', author: MARA, at: NOW - 86400 * 2, body: 'Standup notes for the week.' },
      replies: [
        { id: 'am4', author: ANA, at: NOW - 86400 * 2 + 600, body: 'Nothing from me.' },
        { id: 'am5', author: RAVI, at: NOW - 86400 * 2 + 1200, body: 'Same.' },
        { id: 'am6', author: MARA, at: NOW - 86400, body: 'Oh — related to what we said on Tuesday, this one.' },
      ],
    },
  },
]
